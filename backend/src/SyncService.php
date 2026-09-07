<?php

declare(strict_types=1);

namespace Amei;

/**
 * minne → site synchronisation.
 *
 * The whole point of this class is that production is never in a half-updated
 * state. A run stages everything — JSON and images — under a per-run temporary
 * directory, validates it as a whole, and only then swaps it in:
 *
 *   start → products → image × N → commit
 *            ↑ staging area                ↑ validate, publish, swap, prune
 *
 * If any validation fails, production keeps the previous successful catalogue
 * and the run is recorded as failed.
 */
final class SyncService
{
    /** Below this ratio of the previous product count, a run is rejected. */
    private const MIN_PRODUCT_RATIO = 0.7;   // i.e. a >30% drop is suspicious
    private const MIN_IMAGE_SUCCESS_RATE = 0.95;
    private const FAILED_RETENTION_HOURS = 24;

    public static function stagingRoot(): string
    {
        return STORAGE_DIR . '/sync';
    }

    public static function stagingDir(string $syncId): string
    {
        return self::stagingRoot() . '/' . $syncId;
    }

    /** Validates the id shape before it is ever used in a path. */
    public static function isValidSyncId(string $syncId): bool
    {
        return preg_match('/^[0-9a-f]{32}$/', $syncId) === 1;
    }

    /* ---------------------------------------------------------------- start */

    public static function start(): string
    {
        self::purgeExpiredStaging();

        $syncId = bin2hex(random_bytes(16));
        $dir = self::stagingDir($syncId);
        if (!mkdir($dir . '/images', 0750, true) && !is_dir($dir . '/images')) {
            throw new \RuntimeException('cannot_create_staging');
        }

        $previousSuccessAt = Database::value(
            "SELECT finished_at FROM sync_sessions WHERE status = 'committed' ORDER BY finished_at DESC LIMIT 1"
        );

        Database::run(
            'INSERT INTO sync_sessions (sync_id, status, previous_success_at) VALUES (:id, :s, :p)',
            [
                ':id' => $syncId,
                ':s'  => 'running',
                ':p'  => is_string($previousSuccessAt) ? $previousSuccessAt : null,
            ]
        );

        Logger::info(Logger::CHANNEL_SYNC, 'Sync started', ['sync_id' => $syncId]);
        return $syncId;
    }

    /* ------------------------------------------------------------- products */

    /**
     * Stores the scraped catalogue and classifies each product.
     *
     * @param list<array<string, mixed>> $products
     * @return array{total: int, categories: array<string, int>, uncategorized: list<array<string, string>>}
     */
    public static function stageProducts(string $syncId, array $products): array
    {
        $dir = self::stagingDir($syncId);
        if (!is_dir($dir)) {
            throw new \RuntimeException('unknown_sync_id');
        }

        $overrides = ProductRepository::overrides();
        $normalised = [];
        $uncategorized = [];
        $counts = ['album-flake' => 0, 'stamp' => 0];

        foreach ($products as $index => $raw) {
            $product = self::normaliseProduct($raw, $index);
            if ($product === null) {
                throw new \RuntimeException('invalid_product_payload');
            }

            $category = Categorizer::classify(
                $product['id'],
                $product['name'],
                $product['description'],
                $overrides,
            );

            if ($category === null) {
                // Withheld from the public site and raised to the
                // administrator. The *whole* record is kept, not just an
                // identifier: publishing it later has to be possible without
                // waiting for another sync, and that needs the description,
                // the price and the image filenames.
                $uncategorized[] = $product;
                continue;
            }

            $product['category'] = $category;
            $product['categoryOverridden'] = isset($overrides[$product['id']]);
            $counts[$category] = ($counts[$category] ?? 0) + 1;
            $normalised[] = $product;
        }

        self::writeJson($dir . '/products.json', $normalised);
        self::writeJson($dir . '/uncategorized.json', $uncategorized);

        Database::run(
            'UPDATE sync_sessions
             SET total_products = :t, album_flake_count = :a, stamp_count = :s, uncategorized_count = :u
             WHERE sync_id = :id',
            [
                ':t'  => count($normalised),
                ':a'  => $counts['album-flake'] ?? 0,
                ':s'  => $counts['stamp'] ?? 0,
                ':u'  => count($uncategorized),
                ':id' => $syncId,
            ]
        );

        return ['total' => count($normalised), 'categories' => $counts, 'uncategorized' => $uncategorized];
    }

    /* ---------------------------------------------------------------- image */

    /**
     * Stores one already-converted WebP into the staging area.
     *
     * The scraper does the download, resize and WebP conversion (it has the
     * bandwidth and the concurrency budget); this side validates that what
     * arrived really is a WebP and files it under a safe path.
     */
    public static function stageImage(string $syncId, string $productId, string $filename, string $tmpPath): void
    {
        if (!self::isSafeProductId($productId)) {
            throw new \RuntimeException('invalid_product_id');
        }
        if (preg_match('/^[a-z0-9._-]{1,64}\.webp$/i', $filename) !== 1) {
            throw new \RuntimeException('invalid_filename');
        }

        $info = @getimagesize($tmpPath);
        if ($info === false || $info[2] !== IMAGETYPE_WEBP) {
            throw new \RuntimeException('not_a_webp');
        }

        $dir = self::stagingDir($syncId) . '/images/' . $productId;
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot_create_image_dir');
        }

        $dest = $dir . '/' . $filename;
        if (!move_uploaded_file($tmpPath, $dest) && !rename($tmpPath, $dest)) {
            throw new \RuntimeException('cannot_store_image');
        }
        @chmod($dest, 0644);

        // Dimensions are recorded alongside so the frontend can reserve space.
        $meta = $dir . '/meta.json';
        $existing = is_readable($meta) ? json_decode((string) file_get_contents($meta), true) : [];
        if (!is_array($existing)) {
            $existing = [];
        }
        $existing[$filename] = ['width' => (int) $info[0], 'height' => (int) $info[1]];
        self::writeJson($meta, $existing);
    }

    /* --------------------------------------------------------------- commit */

    /**
     * Validates the staged run and, only if everything passes, publishes it.
     *
     * @param array{imageSuccess: int, imageFailure: int, mainImageFailure: int} $stats
     * @return array<string, mixed>
     */
    public static function commit(string $syncId, array $stats): array
    {
        $dir = self::stagingDir($syncId);
        $productsFile = $dir . '/products.json';
        if (!is_readable($productsFile)) {
            self::fail($syncId, 'no_products_staged', 'sync/commit: no staged product data');
            throw new \RuntimeException('no_products_staged');
        }

        /** @var list<array<string, mixed>> $products */
        $products = json_decode((string) file_get_contents($productsFile), true) ?: [];

        $errors = self::validate($products, $stats);
        if ($errors !== []) {
            self::fail($syncId, implode(' / ', $errors), 'sync/commit: validation failed');
            throw new SyncValidationException(implode(' / ', $errors));
        }

        $previousIds = ProductRepository::allIds();
        $newIds = array_map(static fn (array $p): string => (string) $p['id'], $products);
        $added = array_values(array_diff($newIds, $previousIds));
        $removed = array_values(array_diff($previousIds, $newIds));

        // 1. Move staged images into place and rewrite each product's paths.
        $products = self::publishImages($syncId, $products);

        // 2. Swap the catalogue in atomically.
        ProductRepository::writeAtomically(ProductRepository::jsonPath(), [
            'generatedAt' => date(DATE_ATOM),
            'syncId'      => $syncId,
            'products'    => $products,
        ]);

        // 3. Only now discard the images of products that disappeared.
        foreach ($removed as $productId) {
            self::deleteProductImages($productId);
        }

        // Before the staging area is deleted below: the pending store keeps
        // the unclassified products and their images so an administrator can
        // publish one on demand.
        self::retainUncategorized($dir);

        Database::run(
            "UPDATE sync_sessions
             SET status = 'committed', finished_at = NOW(), added_count = :a, removed_count = :r,
                 image_success_count = :is, image_failure_count = :if, http_status = 200
             WHERE sync_id = :id",
            [
                ':a'  => count($added),
                ':r'  => count($removed),
                ':is' => $stats['imageSuccess'],
                ':if' => $stats['imageFailure'],
                ':id' => $syncId,
            ]
        );

        self::removeDirectory($dir); // a successful run keeps nothing
        Database::run("UPDATE sync_sessions SET temp_purged = 1 WHERE sync_id = :id", [':id' => $syncId]);
        self::pruneHistory();

        Logger::info(Logger::CHANNEL_SYNC, 'Sync committed', [
            'sync_id' => $syncId,
            'total'   => count($products),
            'added'   => count($added),
            'removed' => count($removed),
        ]);

        return [
            'syncId'    => $syncId,
            'total'     => count($products),
            'added'     => count($added),
            'removed'   => count($removed),
            'addedIds'  => $added,
            'removedIds' => $removed,
        ];
    }

    /**
     * The checks that decide whether production may be touched.
     * HTTP 200 from the scraper is explicitly *not* one of them.
     *
     * @param list<array<string, mixed>> $products
     * @param array{imageSuccess: int, imageFailure: int, mainImageFailure: int} $stats
     * @return list<string>
     */
    private static function validate(array $products, array $stats): array
    {
        $errors = [];

        if ($products === []) {
            $errors[] = '商品が0件です';
        }

        foreach ($products as $product) {
            foreach (['id', 'name', 'price', 'url', 'category'] as $field) {
                if (!isset($product[$field]) || $product[$field] === '' ) {
                    $errors[] = "必須項目が不足しています（{$field}）";
                    break 2;
                }
            }
            if (!is_array($product['images'] ?? null) || $product['images'] === []) {
                $errors[] = '画像のない商品が含まれています';
                break;
            }
        }

        $previousCount = count(ProductRepository::allIds());
        if ($previousCount > 0 && count($products) < $previousCount * self::MIN_PRODUCT_RATIO) {
            $errors[] = sprintf('商品数が前回より30%%以上減少しています（%d → %d）', $previousCount, count($products));
        }

        if ($stats['mainImageFailure'] > 0) {
            $errors[] = 'メイン画像の取得に失敗した商品があります';
        }

        $imageTotal = $stats['imageSuccess'] + $stats['imageFailure'];
        if ($imageTotal > 0) {
            $rate = $stats['imageSuccess'] / $imageTotal;
            if ($rate < self::MIN_IMAGE_SUCCESS_RATE) {
                $errors[] = sprintf('画像取得成功率が95%%未満です（%.1f%%）', $rate * 100);
            }
        }

        return $errors;
    }

    /**
     * @param list<array<string, mixed>> $products
     * @return list<array<string, mixed>>
     */
    private static function publishImages(string $syncId, array $products): array
    {
        $stagingImages = self::stagingDir($syncId) . '/images';
        $publicBase = ProductRepository::imageBaseDir();

        if (!is_dir($publicBase) && !mkdir($publicBase, 0755, true) && !is_dir($publicBase)) {
            throw new \RuntimeException('cannot_create_products_dir');
        }

        foreach ($products as $i => $product) {
            $productId = (string) $product['id'];
            $srcDir = $stagingImages . '/' . $productId;
            $destDir = $publicBase . '/' . $productId;

            if (!is_dir($srcDir)) {
                continue; // no new images for this product in this run
            }

            $meta = [];
            if (is_readable($srcDir . '/meta.json')) {
                $decoded = json_decode((string) file_get_contents($srcDir . '/meta.json'), true);
                if (is_array($decoded)) {
                    $meta = $decoded;
                }
            }

            // Replace the directory wholesale so stale images cannot linger.
            self::removeDirectory($destDir);
            if (!mkdir($destDir, 0755, true) && !is_dir($destDir)) {
                throw new \RuntimeException('cannot_create_product_image_dir');
            }

            $images = [];
            /** @var list<array<string, mixed>> $declared */
            $declared = is_array($product['images'] ?? null) ? $product['images'] : [];
            foreach ($declared as $image) {
                $thumb = basename((string) ($image['thumb'] ?? ''));
                $large = basename((string) ($image['large'] ?? ''));
                if ($thumb === '' || $large === '') {
                    continue;
                }
                if (!is_file($srcDir . '/' . $thumb) || !is_file($srcDir . '/' . $large)) {
                    continue;
                }
                rename($srcDir . '/' . $thumb, $destDir . '/' . $thumb);
                rename($srcDir . '/' . $large, $destDir . '/' . $large);

                $images[] = [
                    'thumb'  => "/products/{$productId}/{$thumb}",
                    'large'  => "/products/{$productId}/{$large}",
                    'width'  => (int) ($meta[$large]['width'] ?? 1600),
                    'height' => (int) ($meta[$large]['height'] ?? 1600),
                ];
            }

            $products[$i]['images'] = $images;
        }

        return $products;
    }

    /**
     * Removes a product's published images.
     *
     * Not private any more: withdrawing a manual category can take a product
     * back out of the shop, and that has to clean up the same way a sync does.
     */
    public static function deleteProductImages(string $productId): void
    {
        if (!self::isSafeProductId($productId)) {
            return;
        }
        self::removeDirectory(ProductRepository::imageBaseDir() . '/' . $productId);
    }

    /**
     * Moves the run's unclassified products into the pending store and records
     * them for the admin screen.
     *
     * Runs while the staging area still exists, because that is where their
     * images are. Both the store and the table are rebuilt rather than merged,
     * so a product that has since been classified — or has vanished from minne
     * — leaves on its own.
     */
    private static function retainUncategorized(string $dir): void
    {
        $file = $dir . '/uncategorized.json';
        $items = is_readable($file) ? json_decode((string) file_get_contents($file), true) : [];
        if (!is_array($items)) {
            $items = [];
        }

        /** @var list<array<string, mixed>> $products */
        $products = array_values(array_filter($items, static fn ($item): bool => is_array($item)));

        PendingProducts::replaceAll($products, $dir . '/images');

        Database::run('DELETE FROM uncategorized_products');
        foreach ($products as $item) {
            Database::run(
                'INSERT INTO uncategorized_products (product_id, name, url) VALUES (:id, :n, :u)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), url = VALUES(url)',
                [
                    ':id' => mb_substr((string) ($item['id'] ?? ''), 0, 32),
                    ':n'  => mb_substr((string) ($item['name'] ?? ''), 0, 255),
                    ':u'  => mb_substr((string) ($item['url'] ?? ''), 0, 500),
                ]
            );
        }
    }

    /* ----------------------------------------------------------- lifecycle */

    public static function fail(string $syncId, string $reason, string $logMessage, ?int $httpStatus = null): void
    {
        Database::run(
            "UPDATE sync_sessions
             SET status = 'failed', finished_at = NOW(), error_summary = :e, http_status = :h
             WHERE sync_id = :id",
            [':e' => mb_substr($reason, 0, 500), ':h' => $httpStatus, ':id' => $syncId]
        );
        Logger::error(Logger::CHANNEL_SYNC, $logMessage, ['sync_id' => $syncId, 'reason' => $reason]);
    }

    public static function abort(string $syncId, string $reason = 'aborted by client'): void
    {
        Database::run(
            "UPDATE sync_sessions SET status = 'aborted', finished_at = NOW(), error_summary = :e WHERE sync_id = :id",
            [':e' => mb_substr($reason, 0, 500), ':id' => $syncId]
        );
        self::removeDirectory(self::stagingDir($syncId));
        Database::run('UPDATE sync_sessions SET temp_purged = 1 WHERE sync_id = :id', [':id' => $syncId]);
    }

    /** Failed runs keep their staging area for 24 hours, then it goes. */
    public static function purgeExpiredStaging(): void
    {
        $rows = Database::all(
            "SELECT sync_id FROM sync_sessions
             WHERE temp_purged = 0
               AND status <> 'running'
               AND finished_at IS NOT NULL
               AND finished_at < (NOW() - INTERVAL :h HOUR)",
            [':h' => self::FAILED_RETENTION_HOURS]
        );
        foreach ($rows as $row) {
            $id = (string) $row['sync_id'];
            self::removeDirectory(self::stagingDir($id));
            Database::run('UPDATE sync_sessions SET temp_purged = 1 WHERE sync_id = :id', [':id' => $id]);
        }

        // A run that never reached commit (process died mid-way) is stale
        // after a day and must not hold a staging directory forever.
        Database::run(
            "UPDATE sync_sessions
             SET status = 'failed', finished_at = NOW(),
                 error_summary = 'タイムアウト（commitされませんでした）'
             WHERE status = 'running' AND started_at < (NOW() - INTERVAL 1 DAY)"
        );
    }

    /** Sync history is kept for 90 days. */
    public static function pruneHistory(): void
    {
        Database::run('DELETE FROM sync_sessions WHERE started_at < (NOW() - INTERVAL 90 DAY)');
    }

    public static function session(string $syncId): ?array
    {
        return Database::one('SELECT * FROM sync_sessions WHERE sync_id = :id', [':id' => $syncId]);
    }

    public static function lastSuccessAt(): ?string
    {
        $value = Database::value(
            "SELECT finished_at FROM sync_sessions WHERE status = 'committed' ORDER BY finished_at DESC LIMIT 1"
        );
        return is_string($value) ? $value : null;
    }

    /* -------------------------------------------------------------- helpers */

    /**
     * @param array<string, mixed> $raw
     * @return array<string, mixed>|null
     */
    private static function normaliseProduct(mixed $raw, int $index): ?array
    {
        if (!is_array($raw)) {
            return null;
        }
        $id = trim((string) ($raw['id'] ?? ''));
        $name = trim((string) ($raw['name'] ?? ''));
        $url = trim((string) ($raw['url'] ?? ''));

        if (!self::isSafeProductId($id) || $name === '') {
            return null;
        }
        if (filter_var($url, FILTER_VALIDATE_URL) === false || !str_starts_with($url, 'https://')) {
            return null;
        }

        $price = $raw['price'] ?? null;
        if (!is_int($price) && !(is_string($price) && ctype_digit($price))) {
            return null;
        }

        $images = [];
        if (is_array($raw['images'] ?? null)) {
            foreach ($raw['images'] as $image) {
                if (!is_array($image)) {
                    continue;
                }
                $thumb = basename((string) ($image['thumb'] ?? ''));
                $large = basename((string) ($image['large'] ?? ''));
                if ($thumb === '' || $large === '') {
                    continue;
                }
                $images[] = ['thumb' => $thumb, 'large' => $large];
            }
        }

        return [
            'id'          => $id,
            'name'        => mb_substr($name, 0, 255),
            'description' => mb_scrub((string) ($raw['description'] ?? ''), 'UTF-8'),
            'price'       => (int) $price,
            'currency'    => 'JPY',
            'url'         => $url,
            'inStock'     => (bool) ($raw['inStock'] ?? true),
            'images'      => $images,
            // minne's own ordering is preserved by the payload order.
            'sortOrder'   => is_int($raw['sortOrder'] ?? null) ? (int) $raw['sortOrder'] : $index,
            'updatedAt'   => date(DATE_ATOM),
        ];
    }

    public static function isSafeProductId(string $id): bool
    {
        return preg_match('/^[A-Za-z0-9_-]{1,32}$/', $id) === 1;
    }

    /** @param array<mixed, mixed>|list<mixed> $data */
    private static function writeJson(string $path, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false || file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('cannot_write_staging_json');
        }
    }

    private static function removeDirectory(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        // Refuse to walk outside the two roots this class owns.
        $real = realpath($dir);
        $allowed = [realpath(self::stagingRoot()), realpath(ProductRepository::imageBaseDir())];
        $ok = false;
        foreach ($allowed as $root) {
            if (is_string($root) && is_string($real) && str_starts_with($real, $root)) {
                $ok = true;
                break;
            }
        }
        if (!$ok || !is_string($real)) {
            Logger::warning(Logger::CHANNEL_SYNC, 'Refused to remove an out-of-scope directory');
            return;
        }

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($real, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST
        );
        foreach ($items as $item) {
            /** @var \SplFileInfo $item */
            if ($item->isDir()) {
                @rmdir($item->getPathname());
            } else {
                @unlink($item->getPathname());
            }
        }
        @rmdir($real);
    }
}
