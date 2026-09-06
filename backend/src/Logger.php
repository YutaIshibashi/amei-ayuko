<?php

declare(strict_types=1);

namespace Amei;

/**
 * Daily application log, separate from PHP's own error log.
 *
 * Hard rule: passwords, API keys and enquiry bodies never reach this file.
 * `scrub()` is the last line of defence for context arrays that were built
 * somewhere else.
 */
final class Logger
{
    public const CHANNEL_SYNC    = 'sync';
    public const CHANNEL_CONTACT = 'contact';
    public const CHANNEL_NEWS    = 'news';
    public const CHANNEL_ADMIN   = 'admin';
    public const CHANNEL_IMAGE   = 'image';
    public const CHANNEL_APP     = 'app';

    private const RETENTION_DAYS = 90;

    /** Keys whose values must never be written, at any nesting level. */
    private const FORBIDDEN_KEYS = [
        'password', 'passwd', 'pass', 'password_hash', 'secret', 'token',
        'api_key', 'apikey', 'authorization', 'smtp_password', 'csrf',
        'message', 'body', 'email', 'mail', 'name', 'turnstile_token',
    ];

    /** @param array<string, mixed> $context */
    public static function info(string $channel, string $message, array $context = []): void
    {
        self::write('INFO', $channel, $message, $context);
    }

    /** @param array<string, mixed> $context */
    public static function warning(string $channel, string $message, array $context = []): void
    {
        self::write('WARN', $channel, $message, $context);
    }

    /** @param array<string, mixed> $context */
    public static function error(string $channel, string $message, array $context = []): void
    {
        self::write('ERROR', $channel, $message, $context);
    }

    /** @param array<string, mixed> $context */
    private static function write(string $level, string $channel, string $message, array $context): void
    {
        $dir = STORAGE_DIR . '/logs';
        if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
            return; // logging must never take the request down
        }

        $line = sprintf(
            "[%s] %s.%s: %s%s\n",
            date('Y-m-d H:i:s'),
            $channel,
            $level,
            self::oneLine($message),
            $context === [] ? '' : ' ' . self::encode(self::scrub($context)),
        );

        @file_put_contents($dir . '/app-' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);

        // Cheap probabilistic cleanup: no cron entry to forget about.
        if (random_int(1, 200) === 1) {
            self::purgeOldLogs($dir);
        }
    }

    /**
     * @param array<mixed, mixed> $context
     * @return array<mixed, mixed>
     */
    private static function scrub(array $context, int $depth = 0): array
    {
        if ($depth > 4) {
            return ['…' => 'truncated'];
        }
        $out = [];
        foreach ($context as $key => $value) {
            $keyLower = strtolower((string) $key);
            $isSecret = false;
            foreach (self::FORBIDDEN_KEYS as $forbidden) {
                if (str_contains($keyLower, $forbidden)) {
                    $isSecret = true;
                    break;
                }
            }
            if ($isSecret) {
                $out[$key] = '[redacted]';
                continue;
            }
            if (is_array($value)) {
                $out[$key] = self::scrub($value, $depth + 1);
            } elseif (is_scalar($value) || $value === null) {
                $out[$key] = is_string($value) ? self::oneLine(mb_substr($value, 0, 300)) : $value;
            } else {
                $out[$key] = '[' . get_debug_type($value) . ']';
            }
        }
        return $out;
    }

    private static function oneLine(string $value): string
    {
        return str_replace(["\r\n", "\r", "\n"], ' ', $value);
    }

    /** @param array<mixed, mixed> $data */
    private static function encode(array $data): string
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $json === false ? '{}' : $json;
    }

    private static function purgeOldLogs(string $dir): void
    {
        $cutoff = time() - self::RETENTION_DAYS * 86400;
        foreach (glob($dir . '/app-*.log') ?: [] as $file) {
            if (@filemtime($file) < $cutoff) {
                @unlink($file);
            }
        }
    }
}
