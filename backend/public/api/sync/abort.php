<?php

declare(strict_types=1);

/**
 * POST /api/sync/abort.php
 *
 * Lets the scraper give up cleanly (a network failure mid-run, say) so the
 * staging area is released instead of waiting for the 24-hour sweep.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once __DIR__ . '/_auth.php';

use Amei\Http;
use Amei\SyncService;

use function Amei\requireSyncAuth;
use function Amei\syncId;

Http::requireMethod('POST');
requireSyncAuth();

$body = Http::jsonBody(8_000);
$id = syncId($body['syncId'] ?? null);
$reason = mb_substr((string) ($body['reason'] ?? 'aborted by client'), 0, 300);

SyncService::abort($id, $reason);

Http::json(['ok' => true], 200);
