<?php

declare(strict_types=1);

namespace Amei;

/**
 * Bearer-token authentication for the sync endpoints.
 *
 * The key is a fixed secret held in GitHub Secrets on one side and in the
 * server's `.env` on the other. It is compared with `hash_equals` so the
 * comparison cannot be timed, and it is never written to any log.
 */
function requireSyncAuth(): void
{
    if (!Http::isHttps() && Config::isProduction()) {
        Http::error('https_required', 'HTTPS required.', 400);
    }

    $expected = Config::get('MINNE_SYNC_API_KEY', '');
    if ($expected === null || $expected === '' || strlen($expected) < 32) {
        Logger::error(Logger::CHANNEL_SYNC, 'Sync API key is missing or too short');
        Http::error('server_misconfigured', 'Sync API is not configured.', 500);
    }

    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if ($header === '') {
        // Some Apache configurations drop Authorization; this is the documented
        // fallback (see the .htaccess rule that re-exposes it).
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    }

    if (!preg_match('/^Bearer\s+(.+)$/i', trim($header), $m)) {
        Logger::warning(Logger::CHANNEL_SYNC, 'Sync request without a bearer token');
        Http::error('unauthorized', 'Unauthorized.', 401);
    }

    if (!hash_equals($expected, trim($m[1]))) {
        Logger::warning(Logger::CHANNEL_SYNC, 'Sync request with an invalid token');
        Http::error('unauthorized', 'Unauthorized.', 401);
    }
}

/** Sync must not run while the site is in maintenance. */
function blockDuringMaintenance(): void
{
    if (!Maintenance::isActive()) {
        return;
    }
    Logger::warning(Logger::CHANNEL_SYNC, 'Sync rejected: maintenance mode is active');
    http_response_code(503);
    header('Retry-After: 3600');
    header('Content-Type: application/json; charset=UTF-8');
    echo json_encode([
        'error'   => 'maintenance',
        'message' => 'Site is in maintenance mode; sync is disabled.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

function syncId(mixed $value): string
{
    $syncId = is_string($value) ? trim($value) : '';
    if (!SyncService::isValidSyncId($syncId)) {
        Http::error('invalid_sync_id', 'Invalid sync id.', 400);
    }
    return $syncId;
}
