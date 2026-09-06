<?php

declare(strict_types=1);

/**
 * POST /api/sync/start.php
 *
 * Opens a synchronisation run and returns its id. Everything that follows is
 * staged under that id and is invisible to the public site until commit.
 */

require_once dirname(__DIR__, 3) . '/_app/bootstrap.php';
require_once __DIR__ . '/_auth.php';

use Amei\Http;
use Amei\ProductRepository;
use Amei\SyncService;

use function Amei\blockDuringMaintenance;
use function Amei\requireSyncAuth;

Http::requireMethod('POST');
requireSyncAuth();
blockDuringMaintenance();

$syncId = SyncService::start();

Http::json([
    'syncId'          => $syncId,
    'previousSuccess' => SyncService::lastSuccessAt(),
    'previousCount'   => count(ProductRepository::allIds()),
], 200);
