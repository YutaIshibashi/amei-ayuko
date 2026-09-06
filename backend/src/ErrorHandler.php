<?php

declare(strict_types=1);

namespace Amei;

/**
 * Turns PHP warnings into exceptions and converts anything uncaught into a
 * generic response. Visitors never see a stack trace, a file path or a SQL
 * fragment; the details go to the application log instead.
 */
final class ErrorHandler
{
    public static function register(): void
    {
        set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
            if ((error_reporting() & $severity) === 0) {
                return false; // suppressed with @ — respect that
            }
            throw new \ErrorException($message, 0, $severity, $file, $line);
        });

        set_exception_handler(static function (\Throwable $e): void {
            self::report($e);
            self::respond();
        });

        register_shutdown_function(static function (): void {
            $error = error_get_last();
            if ($error === null || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
                return;
            }
            Logger::error(Logger::CHANNEL_APP, 'Fatal error', [
                'type' => $error['type'],
                'file' => basename($error['file']),
                'line' => $error['line'],
            ]);
            self::respond();
        });
    }

    public static function report(\Throwable $e): void
    {
        Logger::error(Logger::CHANNEL_APP, get_class($e) . ': ' . $e->getMessage(), [
            'file' => basename($e->getFile()),
            'line' => $e->getLine(),
        ]);
    }

    private static function respond(): void
    {
        if (headers_sent()) {
            return;
        }
        http_response_code(500);

        $accept = $_SERVER['HTTP_ACCEPT'] ?? '';
        $isApi = str_contains($_SERVER['REQUEST_URI'] ?? '', '/api/')
            || str_contains($accept, 'application/json');

        if ($isApi) {
            header('Content-Type: application/json; charset=UTF-8');
            echo json_encode([
                'error' => 'internal_error',
                'message' => 'エラーが発生しました。時間をおいてお試しください。',
            ], JSON_UNESCAPED_UNICODE);
            return;
        }

        header('Content-Type: text/html; charset=UTF-8');
        $file = WEB_ROOT . '/500.html';
        if (is_readable($file)) {
            readfile($file);
            return;
        }
        echo '<!doctype html><meta charset="utf-8"><title>エラー</title>'
            . '<p>エラーが発生しました。時間をおいてお試しください。</p>';
    }
}
