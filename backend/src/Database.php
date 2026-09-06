<?php

declare(strict_types=1);

namespace Amei;

use PDO;
use PDOStatement;

/**
 * PDO access.
 *
 * Every query in the codebase goes through here with bound parameters —
 * there is no string interpolation of user input into SQL anywhere.
 */
final class Database
{
    private static ?PDO $pdo = null;

    public static function pdo(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }

        $host = Config::get('DB_HOST', 'localhost');
        $name = Config::require('DB_NAME');
        $user = Config::require('DB_USER');
        $pass = Config::get('DB_PASSWORD', '') ?? '';
        $port = Config::int('DB_PORT', 3306);

        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $name);

        try {
            self::$pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // Real prepared statements, so the driver never has to
                // interpolate values itself.
                PDO::ATTR_EMULATE_PREPARES   => false,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
                PDO::MYSQL_ATTR_INIT_COMMAND => "SET time_zone = '+09:00'",
            ]);
        } catch (\PDOException $e) {
            // The message can contain credentials — log a redacted note only.
            Logger::error(Logger::CHANNEL_APP, 'Database connection failed', ['code' => $e->getCode()]);
            throw new \RuntimeException('database_unavailable', 0, $e);
        }

        return self::$pdo;
    }

    /**
     * Prepares and executes a statement.
     *
     * Parameters are bound by PHP type rather than passed to `execute()`,
     * because with emulation off MySQL receives every `execute()` value as a
     * string — which is a syntax error in `LIMIT ?` and silently changes
     * comparison semantics elsewhere.
     *
     * @param array<string|int, mixed> $params
     */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::pdo()->prepare($sql);
        foreach ($params as $key => $value) {
            $type = match (true) {
                is_int($value)  => PDO::PARAM_INT,
                is_bool($value) => PDO::PARAM_BOOL,
                $value === null => PDO::PARAM_NULL,
                default         => PDO::PARAM_STR,
            };
            $stmt->bindValue(is_int($key) ? $key + 1 : $key, $value, $type);
        }
        $stmt->execute();
        return $stmt;
    }

    /**
     * @param array<string|int, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /**
     * @param array<string|int, mixed> $params
     * @return list<array<string, mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = self::run($sql, $params)->fetchAll();
        return $rows;
    }

    /** @param array<string|int, mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        $value = self::run($sql, $params)->fetchColumn();
        return $value === false ? null : $value;
    }

    public static function lastInsertId(): int
    {
        return (int) self::pdo()->lastInsertId();
    }

    /**
     * @template T
     * @param callable():T $callback
     * @return T
     */
    public static function transaction(callable $callback): mixed
    {
        $pdo = self::pdo();
        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }
}
