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
     * Pins a product to a category. Later syncs must respect this, which is
     * why the override lives in MySQL rather than in the generated JSON.
     */
    public static function setOverride(string $productId, string $category): void
    {
        if (!isset(self::CATEGORIES[$category])) {
            throw new \InvalidArgumentException('invalid_category');
        }
        Database::run(
            'INSERT INTO product_category_overrides (product_id, category) VALUES (:id, :c)
             ON DUPLICATE KEY UPDATE category = VALUES(category)',
            [':id' => $productId, ':c' => $category]
        );
        AuditLog::write('product_category', $productId);
        self::applyOverrideToLiveData($productId, $category);
    }

    public static function clearOverride(string $productId): void
    {
        Database::run('DELETE FROM product_category_overrides WHERE product_id = :id', [':id' => $productId]);
        AuditLog::write('product_category', $productId);
    }

    /**
     * Rewrites the live JSON so a manual re-categorisation shows up in the
     * shop immediately, without waiting for the next nightly sync.
     */
    private static function applyOverrideToLiveData(string $productId, string $category): void
    {
        $payload = self::payload();
        $products = $payload['products'] ?? [];
        if (!is_array($products)) {
            return;
        }

        $found = false;
        foreach ($products as $i => $product) {
            if (!is_array($product) || (string) ($product['id'] ?? '') !== $productId) {
                continue;
            }
            $products[$i]['category'] = $category;
            $products[$i]['categoryOverridden'] = true;
            $found = true;
            break;
        }

        if (!$found) {
            // The product is currently uncategorised, so it is not in the live
            // file yet; the next sync will pick the override up.
            return;
        }

        $payload['products'] = array_values($products);
        self::writeAtomically(self::jsonPath(), $payload);
        self::$cache = null;

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
    }

    public static function categoryLabel(string $slug): string
    {
        return self::CATEGORIES[$slug] ?? $slug;
    }
}
