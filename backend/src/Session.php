<?php

declare(strict_types=1);

namespace Amei;

/**
 * Session handling for the admin area and for the contact form's CSRF token.
 *
 * The cookie is HttpOnly, SameSite=Lax and Secure whenever the request is
 * HTTPS. Session ids are regenerated on login (fixation) and the session is
 * expired after two hours of absolute lifetime.
 */
final class Session
{
    public const LIFETIME_SECONDS = 7200; // 2 hours

    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            self::$started = true;
            return;
        }

        session_name(Config::get('SESSION_NAME', 'amei_session') ?? 'amei_session');
        session_set_cookie_params([
            'lifetime' => 0, // browser session; server-side lifetime is enforced below
            'path'     => '/',
            'domain'   => '',
            'secure'   => Http::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.cookie_httponly', '1');
        ini_set('session.gc_maxlifetime', (string) self::LIFETIME_SECONDS);

        session_start();
        self::$started = true;

        // Absolute lifetime: a session cannot be kept alive indefinitely by
        // simply staying active.
        $createdAt = $_SESSION['__created_at'] ?? null;
        if (!is_int($createdAt)) {
            $_SESSION['__created_at'] = time();
        } elseif (time() - $createdAt > self::LIFETIME_SECONDS) {
            self::destroy();
            session_start();
            $_SESSION['__created_at'] = time();
        }
    }

    public static function regenerate(): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['__created_at'] = time();
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        self::start();
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        self::start();
        $_SESSION[$key] = $value;
    }

    public static function forget(string $key): void
    {
        self::start();
        unset($_SESSION[$key]);
    }

    public static function flash(string $message, string $type = 'success'): void
    {
        self::start();
        $_SESSION['__flash'][] = ['type' => $type, 'message' => $message];
    }

    /** @return list<array{type: string, message: string}> */
    public static function takeFlashes(): array
    {
        self::start();
        /** @var list<array{type: string, message: string}> $flashes */
        $flashes = $_SESSION['__flash'] ?? [];
        unset($_SESSION['__flash']);
        return $flashes;
    }

    public static function destroy(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return;
        }
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name() ?: 'amei_session', '', [
                'expires'  => time() - 42000,
                'path'     => $params['path'],
                'domain'   => $params['domain'],
                'secure'   => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => 'Lax',
            ]);
        }
        session_destroy();
        self::$started = false;
    }
}
