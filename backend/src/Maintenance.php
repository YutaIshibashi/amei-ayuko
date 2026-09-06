<?php

declare(strict_types=1);

namespace Amei;

/**
 * Maintenance mode.
 *
 * Driven by the presence of a flag file, so it can be switched on from FTP or
 * SSH even when the database is the thing being worked on — which is the whole
 * reason the mode exists.
 *
 * The admin area stays reachable; the public site and the public APIs return
 * 503 so search engines treat the outage as temporary.
 */
final class Maintenance
{
    public static function flagPath(): string
    {
        return WEB_ROOT . '/maintenance.flag';
    }

    public static function isActive(): bool
    {
        return is_file(self::flagPath());
    }

    /** Called by public API endpoints before doing any work. */
    public static function blockApi(): void
    {
        if (!self::isActive()) {
            return;
        }
        http_response_code(503);
        header('Retry-After: 3600');
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store');
        echo json_encode([
            'error'   => 'maintenance',
            'message' => 'ただいまメンテナンス中です。時間をおいて再度お試しください。',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    /** Renders the branded maintenance page with a 503 status. */
    public static function renderPage(): never
    {
        http_response_code(503);
        header('Retry-After: 3600');
        header('Content-Type: text/html; charset=UTF-8');
        header('Cache-Control: no-store');
        Http::securityHeaders(true);

        $file = WEB_ROOT . '/maintenance/index.html';
        if (is_readable($file)) {
            readfile($file);
            exit;
        }

        echo '<!doctype html><html lang="ja"><meta charset="utf-8">'
            . '<meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<title>メンテナンス中 | amei ayuko</title>'
            . '<body style="font-family:sans-serif;text-align:center;padding:4rem 1rem;background:#fff7ef;color:#4a3f3a">'
            . '<h1>ただいまメンテナンス中です</h1>'
            . '<p>時間をおいて再度お試しください。</p></body></html>';
        exit;
    }
}
