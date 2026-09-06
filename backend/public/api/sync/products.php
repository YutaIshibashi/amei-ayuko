<?php

declare(strict_types=1);

/**
 * POST /api/sync/products.php
 *
 * Receives the scraped catalogue for a run and classifies it. Nothing here
 * touches production — the result lands in the run's staging directory.
 *
 * Body: { "syncId": "...", "products": [ … ] }
 */

require_once dirname(__DIR__, 3) . '/_app/bootstrap.php';
require_once __DIR__ . '/_auth.php';

use Amei\Http;
use Amei\Logger;
use Amei\SyncService;

use function Amei\blockDuringMaintenance;
use function Amei\requireSyncAuth;
use function Amei\syncId;

Http::requireMethod('POST');
requireSyncAuth();
blockDuringMaintenance();

// A full catalogue with descriptions is large; 24MB is generous but bounded.
$body = Http::jsonBody(24 * 1024 * 1024);
$id = syncId($body['syncId'] ?? null);

$products = $body['products'] ?? null;
if (!is_array($products)) {
    SyncService::fail($id, 'JSONが不正です（products が配列ではありません）', 'sync/products: malformed payload');
    Http::error('invalid_payload', 'products must be an array.', 400);
}

try {
    /** @var list<array<string, mixed>> $products */
    $result = SyncService::stageProducts($id, array_values($products));
} catch (\RuntimeException $e) {
    SyncService::fail($id, '商品データの検証に失敗しました：' . $e->getMessage(), 'sync/products: staging failed');
    Http::error('invalid_payload', $e->getMessage(), 422);
}

Logger::info(Logger::CHANNEL_SYNC, 'Products staged', [
    'sync_id' => $id,
    'total'   => $result['total'],
]);

Http::json([
    'ok'            => true,
    'staged'        => $result['total'],
    'categories'    => $result['categories'],
    'uncategorized' => count($result['uncategorized']),
], 200);
