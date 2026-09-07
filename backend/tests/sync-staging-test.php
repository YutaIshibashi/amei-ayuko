#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Confirms that re-sending the same image is safe.
 *
 *   php backend/tests/sync-staging-test.php
 *
 * The scraper now retries an image upload up to three times. A retry sends the
 * same (syncId, productId, filename) again, so the server side has to be
 * idempotent — otherwise a retry could duplicate a file, corrupt meta.json, or
 * leave the staging area in a state commit would misread.
 *
 * No database is involved: SyncService::stageImage() derives its path purely
 * from its arguments and touches only the staging directory.
 */

$root = dirname(__DIR__, 2);
putenv('AMEI_APP_DIR=' . $root . '/backend');
putenv('AMEI_WEB_ROOT=' . $root . '/frontend/out');

require $root . '/backend/bootstrap.php';

use Amei\SyncService;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}
if (!function_exists('imagewebp')) {
    fwrite(STDERR, "the gd extension with WebP support is required\n");
    exit(1);
}

/** @var list<array{label: string, ok: bool, detail: string}> $results */
$results = [];

function stagingCheck(string $label, bool $ok, string $detail = ''): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

/** json_encode() that always yields something printable. */
function describe(mixed $value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE);
    return $json === false ? '(unencodable)' : $json;
}

/**
 * Writes a solid-colour WebP of the given size to a fresh temp file.
 *
 * @param positive-int $width
 * @param positive-int $height
 */
function makeWebp(int $width, int $height): string
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
    imagewebp($image, $path, 80);
    imagedestroy($image);
    return $path;
}

$syncId = bin2hex(random_bytes(16));
$productId = 'stagingtest';
$filename = '00-thumb.webp';
$dir = SyncService::stagingDir($syncId) . '/images/' . $productId;

register_shutdown_function(static function () use ($syncId): void {
    exec('rm -rf ' . escapeshellarg(SyncService::stagingDir($syncId)));
});

/* ------------------------------------------------------------ first upload */

SyncService::stageImage($syncId, $productId, $filename, makeWebp(40, 30));

$stored = $dir . '/' . $filename;
stagingCheck('the first upload lands at the expected path', is_file($stored), $stored);

$meta = json_decode((string) @file_get_contents($dir . '/meta.json'), true);
stagingCheck(
    'meta.json records the dimensions',
    is_array($meta) && ($meta[$filename]['width'] ?? null) === 40 && ($meta[$filename]['height'] ?? null) === 30,
    is_array($meta) ? describe($meta[$filename] ?? null) : 'unreadable',
);

$firstBytes = (string) file_get_contents($stored);

/* ------------------------------------- second upload, same identifiers */

// A different size, so an overwrite is distinguishable from a no-op.
SyncService::stageImage($syncId, $productId, $filename, makeWebp(60, 20));

$secondBytes = (string) file_get_contents($stored);

stagingCheck('a retry overwrites rather than duplicating', $firstBytes !== $secondBytes);

$files = array_values(array_diff(scandir($dir) ?: [], ['.', '..']));
sort($files);
stagingCheck(
    'the directory holds exactly the image and its meta',
    $files === ['00-thumb.webp', 'meta.json'],
    implode(', ', $files),
);

$meta = json_decode((string) @file_get_contents($dir . '/meta.json'), true);
stagingCheck(
    'meta.json is updated in place, not appended to',
    is_array($meta) && count($meta) === 1
        && ($meta[$filename]['width'] ?? null) === 60 && ($meta[$filename]['height'] ?? null) === 20,
    is_array($meta) ? describe($meta) : 'unreadable',
);

/* ------------------------------------------- a second image coexists */

SyncService::stageImage($syncId, $productId, '01-large.webp', makeWebp(80, 80));

$meta = json_decode((string) @file_get_contents($dir . '/meta.json'), true);
stagingCheck(
    'a different filename is added alongside, not replacing',
    is_array($meta) && count($meta) === 2 && isset($meta['00-thumb.webp'], $meta['01-large.webp']),
    is_array($meta) ? implode(', ', array_keys($meta)) : 'unreadable',
);

/* --------------------------------------------- rejections happen first */

// Each of these must be refused before anything is written, so a malformed
// retry cannot leave a partial file behind.
$before = scandir($dir) ?: [];

foreach ([
    'a traversing product id' => ['../evil', '00-thumb.webp'],
    'a traversing filename'   => [$productId, '../evil.webp'],
    'a non-webp extension'    => [$productId, 'evil.php'],
] as $label => [$badProduct, $badFile]) {
    $threw = false;
    try {
        SyncService::stageImage($syncId, $badProduct, $badFile, makeWebp(10, 10));
    } catch (\RuntimeException) {
        $threw = true;
    }
    stagingCheck("rejects {$label}", $threw);
}

// A file that is not actually a WebP, however it is named.
$notWebp = tempnam(sys_get_temp_dir(), 'amei-fake-');
file_put_contents($notWebp, "<?php echo 'not an image';");
$threw = false;
try {
    SyncService::stageImage($syncId, $productId, 'disguised.webp', $notWebp);
} catch (\RuntimeException) {
    $threw = true;
}
@unlink($notWebp);
stagingCheck('rejects a non-WebP payload regardless of its name', $threw);

stagingCheck(
    'no rejected upload left anything behind',
    (scandir($dir) ?: []) === $before,
    implode(', ', array_values(array_diff(scandir($dir) ?: [], $before))),
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
