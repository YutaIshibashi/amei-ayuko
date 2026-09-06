<?php

declare(strict_types=1);

namespace Amei;

/**
 * Contact-form throttling and duplicate detection.
 *
 * Stores only a salted hash of the IP and a hash of the submission, never the
 * message or the address itself.
 */
final class RateLimiter
{
    private const WINDOW_SECONDS = 60;   // 1 submission per IP per minute
    private const DUPLICATE_WINDOW = 600; // ignore an identical resend for 10 min
    private const RETENTION_HOURS = 24;

    public static function tooSoon(string $ipHash): bool
    {
        $count = (int) Database::value(
            'SELECT COUNT(*) FROM contact_throttle
             WHERE ip_hash = :ip AND submitted_at > (NOW() - INTERVAL :s SECOND)',
            [':ip' => $ipHash, ':s' => self::WINDOW_SECONDS]
        );
        return $count > 0;
    }

    /**
     * Server-side duplicate guard: a double-tapped submit button, or a retry
     * after a response the browser never received, must not send two mails.
     */
    public static function isDuplicate(string $fingerprint): bool
    {
        $count = (int) Database::value(
            'SELECT COUNT(*) FROM contact_throttle
             WHERE fingerprint = :f AND submitted_at > (NOW() - INTERVAL :s SECOND)',
            [':f' => $fingerprint, ':s' => self::DUPLICATE_WINDOW]
        );
        return $count > 0;
    }

    public static function record(string $ipHash, string $fingerprint): void
    {
        Database::run(
            'INSERT INTO contact_throttle (ip_hash, fingerprint) VALUES (:ip, :f)',
            [':ip' => $ipHash, ':f' => $fingerprint]
        );
        if (random_int(1, 30) === 1) {
            Database::run(
                'DELETE FROM contact_throttle WHERE submitted_at < (NOW() - INTERVAL :h HOUR)',
                [':h' => self::RETENTION_HOURS]
            );
        }
    }

    /** Content hash used for the duplicate check. Not reversible. */
    public static function fingerprint(string $email, string $message): string
    {
        $salt = Config::get('APP_SECRET', 'amei-default-salt') ?? 'amei-default-salt';
        return hash('sha256', strtolower($email) . '|' . $message . '|' . $salt);
    }

    public static function windowSeconds(): int
    {
        return self::WINDOW_SECONDS;
    }
}
