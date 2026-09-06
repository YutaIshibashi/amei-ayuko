<?php

declare(strict_types=1);

namespace Amei;

/**
 * Admin authentication.
 *
 * One account, no roles, no self-service password reset (a forgotten password
 * is reset by the developer directly in the database — see the README).
 * Lockout is evaluated on the IP *and* the account, so neither a single
 * attacker IP nor a distributed guess at one username can grind away.
 */
final class Auth
{
    private const MAX_ATTEMPTS = 5;
    private const LOCK_MINUTES = 15;
    private const SESSION_KEY = '__admin_user_id';

    public static function attempt(string $username, string $password): bool
    {
        $username = trim($username);
        $ipHash = Http::ipHash();

        if (self::isLocked($username, $ipHash)) {
            self::record($username, $ipHash, false);
            return false;
        }

        $row = Database::one(
            'SELECT id, password_hash FROM admin_users WHERE username = :u LIMIT 1',
            [':u' => $username]
        );

        // Always run a hash comparison so a missing account and a wrong
        // password take the same amount of time.
        $hash = is_array($row) ? (string) $row['password_hash'] : '$2y$12$'
            . str_repeat('.', 53);
        $ok = password_verify($password, $hash) && is_array($row);

        self::record($username, $ipHash, $ok);

        if (!$ok) {
            Logger::warning(Logger::CHANNEL_ADMIN, 'Login failed', ['username' => $username]);
            return false;
        }

        // Rehash transparently if the cost factor has moved on.
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            Database::run(
                'UPDATE admin_users SET password_hash = :h WHERE id = :id',
                [':h' => password_hash($password, PASSWORD_DEFAULT), ':id' => (int) $row['id']]
            );
        }

        Session::regenerate();
        Session::set(self::SESSION_KEY, (int) $row['id']);
        Database::run('UPDATE admin_users SET last_login_at = NOW() WHERE id = :id', [':id' => (int) $row['id']]);
        // A successful login clears the failure counter for this pair.
        Database::run(
            'DELETE FROM admin_login_attempts WHERE success = 0 AND (username = :u OR ip_hash = :ip)',
            [':u' => $username, ':ip' => $ipHash]
        );
        AuditLog::write('login_success', (string) $row['id']);

        return true;
    }

    public static function isLocked(string $username, ?string $ipHash = null): bool
    {
        $ipHash ??= Http::ipHash();
        $count = (int) Database::value(
            'SELECT COUNT(*) FROM admin_login_attempts
             WHERE success = 0
               AND attempted_at > (NOW() - INTERVAL :mins MINUTE)
               AND (username = :u OR ip_hash = :ip)',
            [':mins' => self::LOCK_MINUTES, ':u' => $username, ':ip' => $ipHash]
        );
        return $count >= self::MAX_ATTEMPTS;
    }

    public static function lockMinutes(): int
    {
        return self::LOCK_MINUTES;
    }

    public static function userId(): ?int
    {
        $id = Session::get(self::SESSION_KEY);
        return is_int($id) ? $id : null;
    }

    public static function check(): bool
    {
        return self::userId() !== null;
    }

    /** Guard placed at the top of every admin page. */
    public static function requireLogin(): void
    {
        Session::start();
        if (self::check()) {
            return;
        }
        $target = $_SERVER['REQUEST_URI'] ?? '/admin/';
        header('Location: /admin/login.php?redirect=' . rawurlencode($target));
        exit;
    }

    public static function logout(): void
    {
        $id = self::userId();
        if ($id !== null) {
            AuditLog::write('logout', (string) $id);
        }
        Session::destroy();
    }

    private static function record(string $username, string $ipHash, bool $success): void
    {
        Database::run(
            'INSERT INTO admin_login_attempts (username, ip_hash, success) VALUES (:u, :ip, :s)',
            [':u' => mb_substr($username, 0, 64), ':ip' => $ipHash, ':s' => $success ? 1 : 0]
        );
        if (!$success) {
            AuditLog::write('login_failed', $username);
        }
        // Opportunistic cleanup — attempts older than the window are useless.
        if (random_int(1, 50) === 1) {
            Database::run('DELETE FROM admin_login_attempts WHERE attempted_at < (NOW() - INTERVAL 1 DAY)');
        }
    }
}
