#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * The pending-product lifecycle, end to end.
 *
 *   php backend/tests/pending-products-test.php
 *
 * Requires a MySQL/MariaDB database (CI provides one; see ci.yml). It drives
 * the real pipeline — start → stage → commit → override — rather than poking
 * at internals, because the property that matters is a whole-system one: an
 * unclassified product must never reach the shop by accident, and must reach
 * it promptly when someone decides it should.
 */

$root = dirname(__DIR__, 2);
putenv('AMEI_APP_DIR=' . $root . '/backend');

// A scratch document root, so the test never writes into frontend/out.
$webRoot = sys_get_temp_dir() . '/amei-pending-web-' . bin2hex(random_bytes(6));
mkdir($webRoot . '/data', 0755, true);
mkdir($webRoot . '/products', 0755, true);
putenv('AMEI_WEB_ROOT=' . $webRoot);

require $root . '/backend/bootstrap.php';

use Amei\Categorizer;
use Amei\Database;
use Amei\PendingProducts;
use Amei\ProductRepository;
use Amei\SyncService;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

/** @var list<array{label: string, ok: bool, detail: string}> $results */
$results = [];

/** @var list<string> $listed */
$listed = [];

function pendingCheck(string $label, bool $ok, string $detail = ''): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

function shape(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    return $json === false ? '(unencodable)' : $json;
}

register_shutdown_function(static function () use ($webRoot): void {
    exec('rm -rf ' . escapeshellarg($webRoot));
    exec('rm -rf ' . escapeshellarg(PendingProducts::dir()));
    exec('rm -rf ' . escapeshellarg(SyncService::stagingRoot()));
});

/* --------------------------------------------------------------- database */

try {
    Database::pdo();
} catch (\Throwable $e) {
    fwrite(STDERR, "a database is required for this test (see ci.yml)\n");
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

// Self-provisioning, so the test needs no mysql client and no separate CI
// step. Guarded on the database name: this applies schema and truncates
// tables, and must never be pointed at anything but a scratch database.
$databaseName = (string) \Amei\Config::require('DB_NAME');
if (!str_contains($databaseName, 'test')) {
    fwrite(STDERR, "refusing to run against '{$databaseName}': the name must contain 'test'\n");
    exit(1);
}

$hasSchema = false;
try {
    Database::value('SELECT COUNT(*) FROM uncategorized_products');
    $hasSchema = true;
} catch (\Throwable) {
    // The table is missing; the migration below creates it.
}

if (!$hasSchema) {
    $migration = (string) file_get_contents($root . '/backend/migrations/001_initial.sql');
    Database::pdo()->exec($migration);
}

foreach (['uncategorized_products', 'product_category_overrides', 'sync_sessions'] as $table) {
    Database::run("DELETE FROM {$table}");
}

PendingProducts::clear();

/* ---------------------------------------------------------------- fixtures */

/**
 * A title the classifier cannot place: no flake, stamp or album keywords.
 *
 * @return array<string, mixed>
 */
function unclassifiableProduct(string $id, int $sortOrder): array
{
    return [
        'id' => $id,
        'name' => "ふしぎな贈りもの {$id}",
        'description' => 'このアイテムは分類キーワードを含みません。',
        'price' => 1200,
        'url' => "https://minne.com/items/{$id}",
        'inStock' => true,
        'sortOrder' => $sortOrder,
        'images' => [['thumb' => '00-thumb.webp', 'large' => '00-large.webp']],
    ];
}

/** @return array<string, mixed> */
function stampProduct(string $id, int $sortOrder): array
{
    return [
        'id' => $id,
        'name' => "てがき ラバースタンプ {$id}",
        'description' => 'はんこ・ラバースタンプです。',
        'price' => 1500,
        'url' => "https://minne.com/items/{$id}",
        'inStock' => true,
        'sortOrder' => $sortOrder,
        'images' => [['thumb' => '00-thumb.webp', 'large' => '00-large.webp']],
    ];
}

/**
 * @param positive-int $width
 * @param positive-int $height
 */
function writeWebp(int $width, int $height): string
{
    $image = imagecreatetruecolor($width, $height);
    $colour = imagecolorallocate($image, 232, 131, 107);
    if ($colour !== false) {
        imagefilledrectangle($image, 0, 0, $width - 1, $height - 1, $colour);
    }
    $path = tempnam(sys_get_temp_dir(), 'amei-webp-');
    if ($path === false) {
        throw new \RuntimeException('cannot create a temp file');
    }
    imagewebp($image, $path, 70);
    imagedestroy($image);
    return $path;
}

/**
 * Runs a whole sync for the given staged products.
 *
 * @param list<array<string, mixed>> $products
 */
function runSync(array $products): void
{
    $syncId = SyncService::start();
    SyncService::stageProducts($syncId, $products);

    foreach ($products as $product) {
        foreach (['00-thumb.webp', '00-large.webp'] as $filename) {
            SyncService::stageImage($syncId, (string) $product['id'], $filename, writeWebp(24, 18));
        }
    }

    SyncService::commit($syncId, [
        'imageSuccess' => count($products) * 2,
        'imageFailure' => 0,
        'mainImageFailure' => 0,
    ]);
}

function publishedIds(): array
{
    return array_map(static fn (array $p): string => (string) $p['id'], ProductRepository::all());
}

function pendingIds(): array
{
    return array_map(static fn (array $p): string => (string) $p['id'], PendingProducts::all());
}

function uncategorizedCount(string $productId): int
{
    return (int) Database::value(
        'SELECT COUNT(*) FROM uncategorized_products WHERE product_id = :id',
        [':id' => $productId],
    );
}

/* ------------------------------------------------------- 1. the first sync */

$productA = unclassifiableProduct('AAA111', 1);
$productB = unclassifiableProduct('BBB222', 2);
$productC = stampProduct('CCC333', 3);

// The classifier really must not place A and B, or the rest proves nothing.
pendingCheck(
    'the fixtures are genuinely unclassifiable',
    Categorizer::classify('AAA111', $productA['name'], $productA['description']) === null
        && Categorizer::classify('BBB222', $productB['name'], $productB['description']) === null
        && Categorizer::classify('CCC333', $productC['name'], $productC['description']) === 'stamp',
);

runSync([$productA, $productB, $productC]);

pendingCheck(
    'an unclassified product is not published',
    publishedIds() === ['CCC333'],
    shape(publishedIds()),
);

pendingCheck(
    'it is held in the pending store instead',
    pendingIds() === ['AAA111', 'BBB222'],
    shape(pendingIds()),
);

pendingCheck(
    'its images are kept out of the document root',
    is_file(PendingProducts::imagesDir() . '/AAA111/00-large.webp')
        && !is_dir($webRoot . '/products/AAA111'),
);

pendingCheck(
    'the pending store sits outside the web root entirely',
    !str_starts_with((string) realpath(PendingProducts::dir()), (string) realpath($webRoot)),
    PendingProducts::dir(),
);

// It lives under _app/storage on a real server, and _app is denied outright.
// Structural, not incidental: nothing pending is reachable over HTTP until it
// is deliberately copied into the document root.
$htaccess = (string) file_get_contents($root . '/backend/public/.htaccess');
pendingCheck(
    'and under a path Apache refuses to serve',
    str_starts_with(PendingProducts::dir(), STORAGE_DIR)
        && str_contains($htaccess, 'RewriteRule ^_app/ - [F,L]'),
);

$listed = array_map(
    static fn (array $r): string => (string) $r['product_id'],
    Database::all('SELECT product_id FROM uncategorized_products ORDER BY product_id'),
);
pendingCheck('both appear in the admin list', $listed === ['AAA111', 'BBB222'], shape($listed));

/* ------------------------------------------- 2. publishing just one of them */

ProductRepository::setOverride('AAA111', 'album-flake');

pendingCheck(
    'the chosen product is published immediately',
    in_array('AAA111', publishedIds(), true),
    shape(publishedIds()),
);

$published = ProductRepository::find('AAA111');
pendingCheck(
    'under the category that was chosen, marked as overridden',
    $published !== null
        && $published['category'] === 'album-flake'
        && ($published['categoryOverridden'] ?? false) === true,
    shape($published['category'] ?? null),
);

pendingCheck(
    'its images are now served from the document root',
    is_file($webRoot . '/products/AAA111/00-large.webp')
        && is_file($webRoot . '/products/AAA111/00-thumb.webp'),
);

pendingCheck(
    'the record points at those files',
    ($published['images'][0]['large'] ?? '') === '/products/AAA111/00-large.webp',
    shape($published['images'][0] ?? null),
);

pendingCheck('it leaves the pending store', pendingIds() === ['BBB222'], shape(pendingIds()));
pendingCheck('and the admin list', uncategorizedCount('AAA111') === 0);

pendingCheck(
    'the one left alone stays pending and unpublished',
    !in_array('BBB222', publishedIds(), true)
        && in_array('BBB222', pendingIds(), true)
        && uncategorizedCount('BBB222') === 1,
);

pendingCheck(
    "minne's ordering is preserved when the product is inserted",
    publishedIds() === ['AAA111', 'CCC333'],
    shape(publishedIds()),
);

/* ------------------------------------------------------ 3. setting it again */

ProductRepository::setOverride('AAA111', 'album-flake');
pendingCheck(
    'setting the same category again does not duplicate it',
    count(array_filter(publishedIds(), static fn (string $id): bool => $id === 'AAA111')) === 1,
    shape(publishedIds()),
);

ProductRepository::setOverride('AAA111', 'stamp');
pendingCheck(
    'changing the category updates it in place',
    (ProductRepository::find('AAA111')['category'] ?? '') === 'stamp'
        && count(array_filter(publishedIds(), static fn (string $id): bool => $id === 'AAA111')) === 1,
);
ProductRepository::setOverride('AAA111', 'album-flake');

/* -------------------------------------------------------- 4. the next sync */

runSync([$productA, $productB, $productC]);

$afterSync = ProductRepository::find('AAA111');
pendingCheck(
    'the manual category survives the next sync',
    $afterSync !== null && $afterSync['category'] === 'album-flake',
    shape($afterSync['category'] ?? null),
);
pendingCheck('and is still marked as overridden', ($afterSync['categoryOverridden'] ?? false) === true);

pendingCheck(
    'the product left pending is still pending after the sync',
    pendingIds() === ['BBB222'],
    shape(pendingIds()),
);
pendingCheck(
    'its images survived the staging area being deleted',
    is_file(PendingProducts::imagesDir() . '/BBB222/00-large.webp'),
);

/* --------------------------------------------- 5. withdrawing the override */

ProductRepository::clearOverride('AAA111');

pendingCheck(
    'withdrawing an override on an unclassifiable product unpublishes it',
    !in_array('AAA111', publishedIds(), true),
    shape(publishedIds()),
);
pendingCheck(
    'and returns it to pending, images and all',
    in_array('AAA111', pendingIds(), true)
        && is_file(PendingProducts::imagesDir() . '/AAA111/00-large.webp')
        && !is_dir($webRoot . '/products/AAA111'),
);
pendingCheck('and back onto the admin list', uncategorizedCount('AAA111') === 1);

// The other branch: an override that merely corrected a category the
// classifier would have found anyway must not unpublish anything.
ProductRepository::setOverride('CCC333', 'album-flake');
pendingCheck(
    'an override on a classifiable product changes its category',
    (ProductRepository::find('CCC333')['category'] ?? '') === 'album-flake',
);

ProductRepository::clearOverride('CCC333');
$restored = ProductRepository::find('CCC333');
pendingCheck(
    'withdrawing it keeps the product published under the automatic category',
    $restored !== null && $restored['category'] === 'stamp'
        && ($restored['categoryOverridden'] ?? true) === false,
    shape($restored['category'] ?? null),
);

/* ----------------------------------------------- 6. failure leaves it alone */

$before = (string) file_get_contents(ProductRepository::jsonPath());

// A pending record whose images are missing cannot be published; the attempt
// must leave both the catalogue and the document root untouched.
PendingProducts::store(unclassifiableProduct('DDD444', 4), '/nonexistent-source-directory');

$threw = false;
try {
    ProductRepository::setOverride('DDD444', 'stamp');
} catch (\Throwable) {
    $threw = true;
}

pendingCheck('publishing a product with no usable images fails', $threw);
pendingCheck(
    'and does not touch products.json',
    (string) file_get_contents(ProductRepository::jsonPath()) === $before,
);
pendingCheck(
    'and leaves no half-published image directory behind',
    !is_dir($webRoot . '/products/DDD444'),
);

/* ----------------------------------------------------------------- result */

$failed = 0;
foreach ($results as $result) {
    if (!$result['ok']) {
        $failed++;
    }
    printf(
        "%-5s %s%s\n",
        $result['ok'] ? 'ok' : 'FAIL',
        $result['label'],
        $result['detail'] === '' ? '' : "  ({$result['detail']})",
    );
}

printf("\n%d checks, %d failed\n", count($results), $failed);
exit($failed === 0 ? 0 : 1);
