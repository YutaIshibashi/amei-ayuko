<?php

declare(strict_types=1);

namespace Amei;

/**
 * Request and response helpers shared by every endpoint.
 */
final class Http
{
    /** Emits the security headers that apply to every response. */
    public static function securityHeaders(bool $isHtml = false): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('X-Frame-Options: SAMEORIGIN');
        header('Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), interest-cohort=()');
        header('Cross-Origin-Opener-Policy: same-origin');
        if ($isHtml) {
            header('Content-Security-Policy: ' . self::csp());
        }
    }

    /**
     * Content Security Policy for HTML responses.
     *
     * 'unsafe-inline' is required for scripts because Next.js inlines its
     * bootstrap, and for styles because components carry inline `style`
     * attributes. Everything else is restricted to the origins actually used:
     * GA4, Turnstile and Google Fonts.
     */
    public static function csp(): string
    {
        return implode('; ', [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'self'",
            "form-action 'self'",
            "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' data: https://www.googletagmanager.com https://www.google-analytics.com",
            "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://*.analytics.google.com",
            "frame-src https://challenges.cloudflare.com",
            'upgrade-insecure-requests',
        ]);
    }

    /** @param array<string, mixed>|list<mixed> $data */
    public static function json(array $data, int $status = 200, int $cacheSeconds = 0): never
    {
        http_response_code($status);
        self::securityHeaders();
        header('Content-Type: application/json; charset=UTF-8');
        header($cacheSeconds > 0
            ? "Cache-Control: public, max-age={$cacheSeconds}, stale-while-revalidate=60"
            : 'Cache-Control: no-store');

        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** @param array<string, string> $fields */
    public static function error(string $code, string $message, int $status = 400, array $fields = []): never
    {
        $payload = ['error' => $code, 'message' => $message];
        if ($fields !== []) {
            $payload['fields'] = $fields;
        }
        self::json($payload, $status);
    }

    /** @return array<string, mixed> */
    public static function jsonBody(int $maxBytes = 2_000_000): array
    {
        // Read one byte past the limit so an oversized body is detectable.
        $limit = max(1, $maxBytes + 1);
        $raw = file_get_contents('php://input', false, null, 0, $limit);
        if ($raw === false || $raw === '') {
            return [];
        }
        if (strlen($raw) > $maxBytes) {
            self::error('payload_too_large', 'リクエストが大きすぎます。', 413);
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            self::error('invalid_json', 'リクエストの形式が正しくありません。', 400);
        }
        /** @var array<string, mixed> $data */
        return $data;
    }

    public static function requireMethod(string ...$allowed): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (!in_array($method, $allowed, true)) {
            header('Allow: ' . implode(', ', $allowed));
            self::error('method_not_allowed', 'このメソッドは利用できません。', 405);
        }
    }

    /**
     * Client IP.
     *
     * Only trusts a forwarding header when TRUSTED_PROXY is enabled, so a
     * visitor cannot spoof their way around the rate limiter by sending an
     * `X-Forwarded-For` of their choosing.
     */
    public static function clientIp(): string
    {
        if (Config::bool('TRUSTED_PROXY', false)) {
            $forwarded = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
            if ($forwarded !== '') {
                $first = trim(explode(',', $forwarded)[0]);
                if (filter_var($first, FILTER_VALIDATE_IP) !== false) {
                    return $first;
                }
            }
        }
        $remote = $_SERVER['REMOTE_ADDR'] ?? '';
        return filter_var($remote, FILTER_VALIDATE_IP) !== false ? $remote : '0.0.0.0';
    }

    /** Stable, non-reversible identifier for rate limiting. */
    public static function ipHash(?string $ip = null): string
    {
        $salt = Config::get('APP_SECRET', 'amei-default-salt') ?? 'amei-default-salt';
        return hash('sha256', ($ip ?? self::clientIp()) . '|' . $salt);
    }

    public static function isHttps(): bool
    {
        if (($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? 'off') !== 'off') {
            return true;
        }
        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
            return true;
        }
        return strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }
}
