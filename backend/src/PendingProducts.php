<?php

declare(strict_types=1);

namespace Amei;

/**
 * Products the classifier could not place, held until a human decides.
 *
 * These are deliberately *not* published — an unclassified product going live
 * under a guessed category is worse than one that is simply missing. But the
 * administrator has to be able to publish one without waiting for the next
 * nightly sync, and that means keeping enough of it around to publish: the
 * full record and every image.
 *
 * The store lives under `_app/storage/`, which Apache denies, so nothing here
 * is reachable over HTTP until it is deliberately copied into the document
 * root. The whole store is rebuilt on every successful sync, so a product that
 * has since been classified — or has disappeared from minne — does not linger.
 */
final class PendingProducts
{
    public static function dir(): string
    {
        return STORAGE_DIR . '/pending';
    }

    public static function imagesDir(): string
    {
        return self::dir() . '/images';
    }

    public static function jsonPath(): string
    {
        return self::dir() . '/products.json';
    }

    /**
     * Every pending product, in the order minne listed them.
     *
     * @return list<array<string, mixed>>
     */
    public static function all(): array
    {
        $path = self::jsonPath();
        if (!is_readable($path)) {
            return [];
        }
        $decoded = json_decode((string) file_get_contents($path), true);
        if (!is_array($decoded)) {
            Logger::error(Logger::CHANNEL_SYNC, 'pending products.json is unreadable');
            return [];
        }

        $products = [];
        foreach ($decoded as $product) {
            if (is_array($product) && SyncService::isSafeProductId((string) ($product['id'] ?? ''))) {
                $products[] = $product;
            }
        }
        return $products;
    }

    /** @return array<string, mixed>|null */
    public static function find(string $productId): ?array
    {
        foreach (self::all() as $product) {
            if ((string) $product['id'] === $productId) {
                return $product;
            }
        }
        return null;
    }

    public static function count(): int
    {
        return count(self::all());
    }

    /**
     * Replaces the whole store with the products a sync could not classify,
     * moving their images out of the run's staging area before it is deleted.
     *
     * Called during commit, while staging still exists. Rebuilding rather than
     * merging is what keeps stale entries from accumulating.
     *
     * @param list<array<string, mixed>> $products records in staged form,
     *        i.e. `images` entries hold bare filenames, not public paths
     */
    public static function replaceAll(array $products, string $stagingImagesDir): void
    {
        self::clear();

        if ($products === []) {
            return;
        }

        if (!is_dir(self::imagesDir()) && !mkdir(self::imagesDir(), 0750, true) && !is_dir(self::imagesDir())) {
            throw new \RuntimeException('cannot_create_pending_images_dir');
        }

        $kept = [];
        foreach ($products as $product) {
            $productId = (string) ($product['id'] ?? '');
            if (!SyncService::isSafeProductId($productId)) {
                continue;
            }

            $source = $stagingImagesDir . '/' . $productId;
            $target = self::imagesDir() . '/' . $productId;

            if (is_dir($source)) {
                if (!mkdir($target, 0750, true) && !is_dir($target)) {
                    throw new \RuntimeException('cannot_create_pending_product_dir');
                }
                foreach (self::imageFilenames($product) as $filename) {
                    if (is_file($source . '/' . $filename)) {
                        rename($source . '/' . $filename, $target . '/' . $filename);
                    }
                }
                if (is_file($source . '/meta.json')) {
                    rename($source . '/meta.json', $target . '/meta.json');
                }
            }

            $kept[] = $product;
        }

        self::write($kept);
    }

    /**
     * Hands a pending product over for publication and forgets it.
     *
     * The record is returned first and only removed once the caller confirms
     * the publication succeeded, so a failure part-way through cannot lose the
     * product entirely.
     *
     * @return array{product: array<string, mixed>, imagesDir: string}|null
     */
    public static function checkout(string $productId): ?array
    {
        if (!SyncService::isSafeProductId($productId)) {
            return null;
        }
        $product = self::find($productId);
        if ($product === null) {
            return null;
        }
        return ['product' => $product, 'imagesDir' => self::imagesDir() . '/' . $productId];
    }

    /** Drops one product and its images from the store. */
    public static function remove(string $productId): void
    {
        if (!SyncService::isSafeProductId($productId)) {
            return;
        }

        $remaining = array_values(array_filter(
            self::all(),
            static fn (array $product): bool => (string) $product['id'] !== $productId,
        ));
        self::write($remaining);

        self::removeTree(self::imagesDir() . '/' . $productId);
    }

    /**
     * Puts a product (back) into the store, copying its images in from
     * wherever they currently live.
     *
     * Used when a manual category is withdrawn and the classifier still cannot
     * place the product: it has to stop being published, but it must not be
     * lost either.
     *
     * @param array<string, mixed> $product record in staged form
     */
    public static function store(array $product, string $sourceImagesDir): void
    {
        $productId = (string) ($product['id'] ?? '');
        if (!SyncService::isSafeProductId($productId)) {
            throw new \RuntimeException('invalid_product_id');
        }

        $target = self::imagesDir() . '/' . $productId;
        self::removeTree($target);
        if (!mkdir($target, 0750, true) && !is_dir($target)) {
            throw new \RuntimeException('cannot_create_pending_product_dir');
        }

        foreach (self::imageFilenames($product) as $filename) {
            $from = $sourceImagesDir . '/' . $filename;
            if (is_file($from)) {
                copy($from, $target . '/' . $filename);
                @chmod($target . '/' . $filename, 0640);
            }
        }

        $products = array_values(array_filter(
            self::all(),
            static fn (array $existing): bool => (string) $existing['id'] !== $productId,
        ));
        $products[] = $product;

        usort(
            $products,
            static fn (array $a, array $b): int => ((int) ($a['sortOrder'] ?? 0)) <=> ((int) ($b['sortOrder'] ?? 0)),
        );

        self::write($products);
    }

    /**
     * Filenames referenced by a staged record.
     *
     * `basename()` on every entry: these names end up in filesystem paths, and
     * the record has passed through a network boundary.
     *
     * @param array<string, mixed> $product
     * @return list<string>
     */
    public static function imageFilenames(array $product): array
    {
        $names = [];
        foreach ((array) ($product['images'] ?? []) as $image) {
            if (!is_array($image)) {
                continue;
            }
            foreach (['thumb', 'large'] as $key) {
                $name = basename((string) ($image[$key] ?? ''));
                if ($name !== '' && preg_match('/^[a-z0-9._-]{1,64}\.webp$/i', $name) === 1) {
                    $names[] = $name;
                }
            }
        }
        return array_values(array_unique($names));
    }

    /** Empties the store completely. */
    public static function clear(): void
    {
        self::removeTree(self::dir());
        if (!is_dir(self::dir()) && !mkdir(self::dir(), 0750, true) && !is_dir(self::dir())) {
            throw new \RuntimeException('cannot_create_pending_dir');
        }
    }

    /** @param list<array<string, mixed>> $products */
    private static function write(array $products): void
    {
        $dir = self::dir();
        if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
            throw new \RuntimeException('cannot_create_pending_dir');
        }

        $json = json_encode(array_values($products), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new \RuntimeException('json_encode_failed');
        }

        // Same temp-then-rename as the public catalogue: a reader must never
        // see a half-written store.
        $tmp = $dir . '/.pending-' . bin2hex(random_bytes(6)) . '.tmp';
        if (file_put_contents($tmp, $json, LOCK_EX) === false) {
            throw new \RuntimeException('cannot_write_pending_products');
        }
        @chmod($tmp, 0640);
        if (!rename($tmp, self::jsonPath())) {
            @unlink($tmp);
            throw new \RuntimeException('cannot_swap_pending_products');
        }
    }

    /** Deletes a directory, refusing anything outside the pending store. */
    private static function removeTree(string $path): void
    {
        if (!is_dir($path)) {
            return;
        }
        $real = realpath($path);
        $root = realpath(STORAGE_DIR);
        if ($real === false || $root === false || !str_starts_with($real, $root . '/')) {
            Logger::warning(Logger::CHANNEL_SYNC, 'refused to remove a path outside storage');
            return;
        }

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($real, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
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
