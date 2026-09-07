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

            // A deprecation is not a failure: it says today's behaviour still
            // works and will change in some future version. Turning one into
            // an exception means a PHP upgrade can take the site down for a
            // notice — which is exactly what happened when PHP 8.5 deprecated
            // PDO::MYSQL_ATTR_INIT_COMMAND and every database-backed endpoint
            // started returning 500. They are logged so they still get fixed,
            // and the request continues.
            //
            // Warnings and notices keep throwing on purpose: those report that
            // something has already gone wrong, and failing loudly beats
            // limping on with a bad value.
            if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
                // The text goes in the log message rather than the context:
                // Logger redacts a context key called `message`, since that is
                // what enquiry bodies are stored under.
                // Deduplicated per request so a deprecation inside a loop
                // cannot fill the day's log with one repeated line.
                static $seen = [];
                $key = $file . ':' . $line;
                if (!isset($seen[$key])) {
                    $seen[$key] = true;
                    Logger::warning(
                        Logger::CHANNEL_APP,
                        'PHP deprecation: ' . $message,
                        ['file' => basename($file), 'line' => $line],
                    );
                }
                return true;
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
