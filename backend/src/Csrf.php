<?php

declare(strict_types=1);

namespace Amei;

/**
 * CSRF tokens, per session.
 *
 * One token per session rather than per form: it survives the contact form's
 * retry path and the admin's multi-tab editing, while still being useless to
 * an attacker who cannot read the victim's session cookie.
 */
final class Csrf
{
    private const KEY = '__csrf_token';

    public static function token(): string
    {
        Session::start();
        $token = Session::get(self::KEY);
        if (!is_string($token) || strlen($token) !== 64) {
            $token = bin2hex(random_bytes(32));
            Session::set(self::KEY, $token);
        }
        return $token;
    }

    public static function verify(?string $candidate): bool
    {
        if ($candidate === null || $candidate === '') {
            return false;
        }
        $expected = Session::get(self::KEY);
        if (!is_string($expected)) {
            return false;
        }
        return hash_equals($expected, $candidate);
    }

    /** Hidden input for admin forms. */
    public static function field(): string
    {
        return '<input type="hidden" name="csrf_token" value="'
            . htmlspecialchars(self::token(), ENT_QUOTES, 'UTF-8') . '">';
    }

    /** Aborts an admin POST that fails verification. */
    public static function requirePost(): void
    {
        $token = $_POST['csrf_token'] ?? null;
        if (!is_string($token) || !self::verify($token)) {
            Logger::warning(Logger::CHANNEL_ADMIN, 'CSRF token rejected', [
                'uri' => $_SERVER['REQUEST_URI'] ?? '',
            ]);
            http_response_code(419);
            header('Content-Type: text/html; charset=UTF-8');
            echo '<!doctype html><meta charset="utf-8"><title>セッションエラー</title>'
                . '<p>セッションの有効期限が切れました。もう一度ログインしてお試しください。</p>'
                . '<p><a href="/admin/login.php">ログイン画面へ</a></p>';
            exit;
        }
    }
}
