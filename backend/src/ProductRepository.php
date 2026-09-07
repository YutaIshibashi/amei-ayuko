<?php

declare(strict_types=1);

namespace Amei;

/**
 * Access to the published product catalogue.
 *
 * Products live in a single JSON file that the sync pipeline swaps in
 * atomically (`rename()` on the same filesystem). The public site fetches that
 * file directly — it is static, cacheable and needs no PHP — while this class
 * is what the server-side pieces (SEO rendering, admin, news relations) read.
 */
final class ProductRepository
{
    public const CATEGORIES = [
        'album-flake' => 'アルバムフレーク',
        'stamp'       => 'ラバースタンプ',
    ];

    /** @var array<string, mixed>|null */
    private static ?array $cache = null;

    public static function jsonPath(): string
    {
        return WEB_ROOT . '/data/products.json';
    }

    public static function imageBaseDir(): string
    {
        return WEB_ROOT . '/products';
    }

    /** @return array<string, mixed> */
    public static function payload(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $path = self::jsonPath();
        if (!is_readable($path)) {
            self::$cache = ['generatedAt' => null, 'syncId' => null, 'products' => []];
            return self::$cache;
        }
        $raw = file_get_contents($path);
        $data = $raw === false ? null : json_decode($raw, true);
        if (!is_array($data) || !isset($data['products']) || !is_array($data['products'])) {
            Logger::error(Logger::CHANNEL_SYNC, 'products.json is unreadable or malformed');
            $data = ['generatedAt' => null, 'syncId' => null, 'products' => []];
        }
        /** @var array<string, mixed> $data */
        self::$cache = $data;
        return $data;
    }

    /** @return list<array<string, mixed>> */
    public static function all(): array
    {
        $products = self::payload()['products'] ?? [];
        /** @var list<array<string, mixed>> $products */
        return is_array($products) ? array_values($products) : [];
    }

    /** @return array<string, mixed>|null */
    public static function find(string $id): ?array
    {
        foreach (self::all() as $product) {
            if ((string) ($product['id'] ?? '') === $id) {
                return $product;
            }
        }
        return null;
    }

    /** @return list<string> */
    public static function allIds(): array
    {
        return array_map(
            static fn (array $p): string => (string) ($p['id'] ?? ''),
            self::all()
        );
    }

    /** @return list<array<string, mixed>> */
    public static function byCategory(string $category): array
    {
        return array_values(array_filter(
            self::all(),
            static fn (array $p): bool => (string) ($p['category'] ?? '') === $category
        ));
    }

    public static function generatedAt(): ?string
    {
        $value = self::payload()['generatedAt'] ?? null;
        return is_string($value) ? $value : null;
    }

    /** @return array<string, string> product_id => category */
    public static function overrides(): array
    {
        $rows = Database::all('SELECT product_id, category FROM product_category_overrides');
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['product_id']] = (string) $row['category'];
        }
        return $out;
    }

    /**
     * Pins a product to a category.
     *
     * Two cases, and the second is the reason this method is not trivial:
     *
     *  - the product is already published — only its category changes;
     *  - the product is pending, i.e. the classifier could not place it and it
     *    was withheld. Then this *publishes* it: its images are copied out of
     *    the pending store into the document root and the record is added to
     *    the catalogue, so the shop shows it without waiting for a sync.
     *
     * Either way the override is recorded in MySQL, and later syncs honour it.
     */
    public static function setOverride(string $productId, string $category): void
    {
        if (!isset(self::CATEGORIES[$category])) {
            throw new \InvalidArgumentException('invalid_category');
        }
        if (!SyncService::isSafeProductId($productId)) {
            throw new \InvalidArgumentException('invalid_product_id');
        }

        Database::run(
            'INSERT INTO product_category_overrides (product_id, category) VALUES (:id, :c)
             ON DUPLICATE KEY UPDATE category = VALUES(category)',
            [':id' => $productId, ':c' => $category]
        );
        AuditLog::write('product_category', $productId);

        if (self::find($productId) !== null) {
            self::applyOverrideToLiveData($productId, $category);
            return;
        }

        self::publishPending($productId, $category);
    }

    /**
     * Withdraws a manual category.
     *
     * The question this has to answer is what happens to a product that is
     * live *because* of the override. Leaving it published would ignore the
     * administrator's decision; removing it unconditionally would unpublish
     * products whose override was only ever a correction to a category the
     * classifier would have found anyway.
     *
     * So the classifier is simply re-run, here and now:
     *
     *  - it places the product → it stays published under the automatic
     *    category, exactly as the next sync would have left it;
     *  - it cannot → the product returns to pending and leaves the shop
     *    immediately, which is the same default as any unclassified product.
     *
     * Doing it now rather than at the next sync means the shop always matches
     * what the admin screen says.
     */
    public static function clearOverride(string $productId): void
    {
        if (!SyncService::isSafeProductId($productId)) {
            throw new \InvalidArgumentException('invalid_product_id');
        }

        Database::run('DELETE FROM product_category_overrides WHERE product_id = :id', [':id' => $productId]);
        AuditLog::write('product_category', $productId);

        $product = self::find($productId);
        if ($product === null) {
            return; // not published; nothing to reconsider
        }

        $automatic = Categorizer::classify(
            $productId,
            (string) ($product['name'] ?? ''),
            (string) ($product['description'] ?? ''),
            [],
        );

        if ($automatic !== null) {
            self::applyOverrideToLiveData($productId, $automatic, false);
            return;
        }

        self::withholdToPending($product);
    }

    /**
     * Publishes a pending product: images into the document root, record into
     * the catalogue.
     *
     * Ordered so a failure cannot leave the shop broken. Images are copied
     * (not moved) into place first, the catalogue is swapped atomically, and
     * only then is the pending copy dropped. If the swap fails, the copied
     * images are removed again and the product stays pending.
     */
    private static function publishPending(string $productId, string $category): void
    {
        $checkout = PendingProducts::checkout($productId);
        if ($checkout === null) {
            // Neither published nor pending: nothing to do beyond the override,
            // which the next sync will apply if the product reappears.
            return;
        }

        $product = $checkout['product'];
        $publicDir = self::imageBaseDir() . '/' . $productId;

        $copied = [];
        try {
            if (!is_dir($publicDir) && !mkdir($publicDir, 0755, true) && !is_dir($publicDir)) {
                throw new \RuntimeException('cannot_create_product_image_dir');
            }

            $meta = [];
            $metaPath = $checkout['imagesDir'] . '/meta.json';
            if (is_readable($metaPath)) {
                $decoded = json_decode((string) file_get_contents($metaPath), true);
                if (is_array($decoded)) {
                    $meta = $decoded;
                }
            }

            $images = [];
            foreach ((array) ($product['images'] ?? []) as $image) {
                if (!is_array($image)) {
                    continue;
                }
                $thumb = basename((string) ($image['thumb'] ?? ''));
                $large = basename((string) ($image['large'] ?? ''));
                if ($thumb === '' || $large === '') {
                    continue;
                }

                foreach ([$thumb, $large] as $name) {
                    $from = $checkout['imagesDir'] . '/' . $name;
                    $to = $publicDir . '/' . $name;
                    if (!is_file($from) || !copy($from, $to)) {
                        throw new \RuntimeException('cannot_copy_pending_image');
                    }
                    @chmod($to, 0644);
                    $copied[] = $to;
                }

                $images[] = [
                    'thumb'  => "/products/{$productId}/{$thumb}",
                    'large'  => "/products/{$productId}/{$large}",
                    'width'  => (int) ($meta[$large]['width'] ?? 1600),
                    'height' => (int) ($meta[$large]['height'] ?? 1600),
                ];
            }

            if ($images === []) {
                throw new \RuntimeException('pending_product_has_no_images');
            }

            $product['category'] = $category;
            $product['categoryOverridden'] = true;
            $product['images'] = $images;

            self::insertIntoCatalogue($product);
        } catch (\Throwable $e) {
            foreach ($copied as $path) {
                @unlink($path);
            }
            // Also when nothing was copied at all: the directory was still
            // created, and an empty one under /products would outlive the
            // failure.
            if (is_dir($publicDir) && self::isEmptyDir($publicDir)) {
                @rmdir($publicDir);
            }
            Logger::error(Logger::CHANNEL_SYNC, 'publishing a pending product failed', [
                'product_id' => $productId,
            ]);
            throw $e;
        }

        // Only once the catalogue has actually been swapped.
        PendingProducts::remove($productId);
        Database::run('DELETE FROM uncategorized_products WHERE product_id = :id', [':id' => $productId]);

        Logger::info(Logger::CHANNEL_SYNC, 'published a pending product', [
            'product_id' => $productId,
            'category'   => $category,
        ]);
    }

    /**
     * Takes a published product back out of the shop and returns it to
     * pending, images and all.
     *
     * @param array<string, mixed> $product the live record
     */
    private static function withholdToPending(array $product): void
    {
        $productId = (string) $product['id'];
        $publicDir = self::imageBaseDir() . '/' . $productId;

        // The pending store holds bare filenames, the way a staged record
        // does, so the paths have to be rewound before it goes back.
        $staged = $product;
        $staged['images'] = array_values(array_map(
            static fn (array $image): array => [
                'thumb' => basename((string) ($image['thumb'] ?? '')),
                'large' => basename((string) ($image['large'] ?? '')),
            ],
            array_filter((array) ($product['images'] ?? []), 'is_array'),
        ));
        unset($staged['categoryOverridden'], $staged['category']);

        // Copy into pending before removing anything: if this throws, the
        // product is still published rather than lost.
        PendingProducts::store($staged, $publicDir);

        $remaining = array_values(array_filter(
            self::all(),
            static fn (array $existing): bool => (string) ($existing['id'] ?? '') !== $productId,
        ));
        self::writeCatalogue($remaining);

        SyncService::deleteProductImages($productId);

        Database::run(
            'INSERT INTO uncategorized_products (product_id, name, url) VALUES (:id, :n, :u)
             ON DUPLICATE KEY UPDATE name = VALUES(name), url = VALUES(url)',
            [
                ':id' => $productId,
                ':n'  => mb_substr((string) ($product['name'] ?? ''), 0, 255),
                ':u'  => mb_substr((string) ($product['url'] ?? ''), 0, 500),
            ]
        );

        Logger::info(Logger::CHANNEL_SYNC, 'returned a product to pending', ['product_id' => $productId]);
    }

    /**
     * Adds a record to the catalogue, keeping minne's ordering.
     *
     * @param array<string, mixed> $product
     */
    private static function insertIntoCatalogue(array $product): void
    {
        $products = array_values(array_filter(
            self::all(),
            static fn (array $existing): bool => (string) ($existing['id'] ?? '') !== (string) $product['id'],
        ));
        $products[] = $product;

        usort(
            $products,
            static fn (array $a, array $b): int => ((int) ($a['sortOrder'] ?? 0)) <=> ((int) ($b['sortOrder'] ?? 0)),
        );

        self::writeCatalogue($products);
    }

    /** @param list<array<string, mixed>> $products */
    private static function writeCatalogue(array $products): void
    {
        $payload = self::payload();
        $payload['products'] = array_values($products);
        self::writeAtomically(self::jsonPath(), $payload);
        self::$cache = null;
    }

    private static function isEmptyDir(string $dir): bool
    {
        return (scandir($dir) ?: []) === ['.', '..'];
    }

    /**
     * Rewrites the live catalogue so a category change shows up in the shop
     * immediately, without waiting for the next nightly sync.
     */
    private static function applyOverrideToLiveData(
        string $productId,
        string $category,
        bool $overridden = true,
    ): void {
        $products = self::all();

        $found = false;
        foreach ($products as $i => $product) {
            if ((string) ($product['id'] ?? '') !== $productId) {
                continue;
            }
            $products[$i]['category'] = $category;
            $products[$i]['categoryOverridden'] = $overridden;
            $found = true;
            break;
        }

        if (!$found) {
            return;
        }

        self::writeCatalogue($products);
        Database::run('DELETE FROM uncategorized_products WHERE product_id = :id', [':id' => $productId]);
    }

    /**
     * Writes JSON through a temporary file in the same directory and renames
     * it into place, so a reader never observes a half-written catalogue.
     *
     * @param array<string, mixed> $payload
     */
    public static function writeAtomically(string $path, array $payload): void
    {
        $dir = dirname($path);
        if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot_create_data_dir');
        }

        $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('json_encode_failed');
        }

        $tmp = $dir . '/.products-' . bin2hex(random_bytes(6)) . '.tmp';
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            throw new \RuntimeException('cannot_write_temp_products');
        }
        @chmod($tmp, 0644);

        // rename() within one filesystem is atomic: readers see either the old
        // file or the new one, never a partial write.
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new \RuntimeException('cannot_swap_products');
        }

        // The in-process cache is now stale. Cleared here rather than at the
        // call sites because this is the function that replaces the file —
        // SyncService::commit() calls it directly, and anything reading after
        // a commit in the same process would otherwise see the old catalogue.
        self::$cache = null;
    }

    public static function categoryLabel(string $slug): string
    {
        return self::CATEGORIES[$slug] ?? $slug;
    }
}
