<?php

declare(strict_types=1);

/**
 * POST /api/sync/image.php  (multipart/form-data)
 *
 * Receives one already-converted WebP for a product in the current run.
 * Fields: syncId, productId, filename, file
 *
 * The scraper does the download and the WebP conversion; this endpoint checks
 * that the bytes really are a WebP and files them under a safe path.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once __DIR__ . '/_auth.php';

use Amei\Http;
use Amei\SyncService;

use function Amei\blockDuringMaintenance;
use function Amei\requireSyncAuth;
use function Amei\syncId;

Http::requireMethod('POST');
requireSyncAuth();
blockDuringMaintenance();

$id = syncId($_POST['syncId'] ?? null);
$productId = trim((string) ($_POST['productId'] ?? ''));
$filename = trim((string) ($_POST['filename'] ?? ''));

$file = $_FILES['file'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    Http::error('upload_failed', 'File upload failed.', 400);
}
if (($file['size'] ?? 0) > 8 * 1024 * 1024) {
    Http::error('file_too_large', 'Image exceeds 8MB.', 413);
}

try {
    SyncService::stageImage($id, $productId, $filename, (string) $file['tmp_name']);
} catch (\RuntimeException $e) {
    Http::error('invalid_image', $e->getMessage(), 422);
}

Http::json(['ok' => true], 200);
