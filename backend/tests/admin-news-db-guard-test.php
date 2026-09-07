#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * The database guard in admin-news-actions-test.php.
 *
 *   php backend/tests/admin-news-db-guard-test.php
 *
 * Requires a MySQL/MariaDB database (CI provides one; see ci.yml).
 *
 * admin-news-actions-test.php empties `news`, `admin_users` and
 * `admin_login_attempts`. It used to decide whether that was safe from
 * `getenv('DB_NAME') ?: 'amei_test'` — before the real bootstrap had run. In
 * any setup that keeps its settings in `.env` rather than in the environment
 * that variable is unset, so the guard read its own default, approved it, and
 * the deletes then landed on whichever database `.env` actually named.
 *
 * So the guard is checked the only way that means anything: run the real test
 * with DB_NAME absent from the environment and a `.env` naming a database
 * whose name is not a test one, and confirm it stops — with the rows still
 * there afterwards.
 */

$root = dirname(__DIR__, 2);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

/** @var list<array{label: string, ok: bool, detail: string}> $results */
$results = [];

function guardCheck(string $label, bool $ok, string $detail = ''): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

/* ------------------------------------------- this test's own configuration */

putenv('AMEI_APP_DIR=' . $root . '/backend');
require $root . '/backend/bootstrap.php';

use Amei\Config;
use Amei\Database;

// This test seeds and reads rows of its own, and the subprocess it drives
// truncates tables, so it is held to the same rule it is checking.
$dbName = Config::require('DB_NAME');
if (!str_contains($dbName, 'test')) {
    fwrite(STDERR, "refusing to run against '{$dbName}': the name must contain 'test'\n");
    exit(1);
}

try {
    Database::pdo();
} catch (\Throwable $e) {
    fwrite(STDERR, "a database is required for this test (see ci.yml)\n");
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

try {
    Database::value('SELECT COUNT(*) FROM news');
} catch (\Throwable) {
    Database::pdo()->exec((string) file_get_contents($root . '/backend/migrations/001_initial.sql'));
}

/* ---------------------------------------- a scratch application directory */

$scratch = sys_get_temp_dir() . '/amei-guard-' . bin2hex(random_bytes(6));
if (!mkdir($scratch, 0o700) && !is_dir($scratch)) {
    fwrite(STDERR, "could not create {$scratch}\n");
    exit(1);
}
register_shutdown_function(static function () use ($scratch): void {
    exec('rm -rf ' . escapeshellarg($scratch));
});

// Everything the bootstrap needs (vendor, src, templates) is shared with the
// real backend by symlink; only `.env` differs. Nothing is copied, so no
// credential is ever written to a temporary file.
foreach ((array) scandir($root . '/backend') as $entry) {
    if (!is_string($entry) || $entry === '.' || $entry === '..' || $entry === '.env') {
        continue;
    }
    symlink($root . '/backend/' . $entry, $scratch . '/' . $entry);
}

// A database name with no 'test' in it, and no credentials at all: the guard
// has to refuse on the name alone, before anything tries to connect.
file_put_contents($scratch . '/.env', implode("\n", [
    'APP_ENV=testing',
    'SITE_URL=http://127.0.0.1',
    'DB_NAME=amei_production',
]) . "\n");
chmod($scratch . '/.env', 0o600);

/* -------------------------------------------------------------- the rows */

Database::run(
    "INSERT INTO news (title, body, category, status) VALUES (:t, :b, 'info', 'draft')",
    [':t' => 'guard marker', ':b' => 'must survive a refused run'],
);
Database::run(
    'INSERT INTO admin_users (username, password_hash) VALUES (:u, :h)',
    [':u' => 'guard-marker', ':h' => password_hash('guard-marker', PASSWORD_DEFAULT)],
);

$newsBefore = (int) Database::value('SELECT COUNT(*) FROM news');
$adminsBefore = (int) Database::value('SELECT COUNT(*) FROM admin_users');

/**
 * Runs admin-news-actions-test.php in its own process.
 *
 * @param array<string, string|false> $overrides values to set, or false to remove
 * @return array{status: int, stdout: string, stderr: string}
 */
function runActionsTest(string $root, array $overrides): array
{
    /** @var array<string, string> $env */
    $env = getenv();
    foreach ($overrides as $key => $value) {
        if ($value === false) {
            unset($env[$key]);
        } else {
            $env[$key] = $value;
        }
    }

    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open(
        [PHP_BINARY, $root . '/backend/tests/admin-news-actions-test.php'],
        $descriptors,
        $pipes,
        $root,
        $env,
    );
    if (!is_resource($process)) {
        throw new \RuntimeException('could not start the actions test');
    }

    $stdout = (string) stream_get_contents($pipes[1]);
    $stderr = (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return ['status' => proc_close($process), 'stdout' => $stdout, 'stderr' => $stderr];
}

/* ------------------------- 1. a non-test `.env`, with DB_NAME unset, stops */

$refused = runActionsTest($root, [
    'AMEI_APP_DIR' => $scratch,
    'DB_NAME' => false,
]);

guardCheck(
    'a non-test database named only in .env is refused',
    $refused['status'] !== 0,
    'exit ' . $refused['status'],
);
guardCheck(
    'and says which database it refused',
    str_contains($refused['stderr'], "refusing to run against 'amei_production'"),
    trim($refused['stderr']),
);
guardCheck(
    'and the fallback default never stood in for the real name',
    !str_contains($refused['stderr'], 'amei_test'),
    trim($refused['stderr']),
);

// If the guard ran after the connection rather than before it, an unreachable
// `amei_production` would announce itself here instead.
guardCheck(
    'and it stopped before opening a connection',
    !str_contains($refused['stderr'], 'a database is required')
        && !str_contains($refused['stderr'], 'SQLSTATE'),
    trim($refused['stderr']),
);
guardCheck(
    'and it stopped before the release tree was even built',
    !str_contains($refused['stderr'], 'failed to assemble'),
    trim($refused['stderr']),
);

/* --------------------------- 2. no database name configured at all stops too */

// `.env` present but silent about the database. Without an explicit refusal
// `Config::require()` would raise, `ErrorHandler` would render it, and the
// process would still exit 0 — a test that never ran, reported as a pass.
file_put_contents($scratch . '/.env', "APP_ENV=testing\nSITE_URL=http://127.0.0.1\n");

$unconfigured = runActionsTest($root, [
    'AMEI_APP_DIR' => $scratch,
    'DB_NAME' => false,
]);

guardCheck(
    'an unconfigured DB_NAME is refused rather than guessed',
    $unconfigured['status'] !== 0
        && str_contains($unconfigured['stderr'], 'DB_NAME is not configured'),
    'exit ' . $unconfigured['status'] . ' ' . trim($unconfigured['stderr']),
);

/* ------------------------------------ 3. and changed nothing on the way out */

$newsAfter = (int) Database::value('SELECT COUNT(*) FROM news');
$adminsAfter = (int) Database::value('SELECT COUNT(*) FROM admin_users');

guardCheck(
    'the news row is still there',
    (int) Database::value('SELECT COUNT(*) FROM news WHERE title = :t', [':t' => 'guard marker']) === 1,
);
guardCheck(
    'the admin user is still there',
    (int) Database::value(
        'SELECT COUNT(*) FROM admin_users WHERE username = :u',
        [':u' => 'guard-marker'],
    ) === 1,
);
guardCheck('no news row was removed', $newsAfter === $newsBefore, "{$newsBefore} → {$newsAfter}");
guardCheck('no admin user was removed', $adminsAfter === $adminsBefore, "{$adminsBefore} → {$adminsAfter}");

/* ---------------------------------------- 4. a test database still runs */

// Left to the ordinary environment, which is a test database — the guard must
// not be so strict that the suite can no longer run. This truncates the marker
// rows above, so it goes last.
$allowed = runActionsTest($root, []);

guardCheck(
    'a test database is allowed through',
    $allowed['status'] === 0,
    'exit ' . $allowed['status'] . ' ' . trim($allowed['stderr']),
);
$summary = array_values(array_filter(
    explode("\n", $allowed['stdout']),
    static fn (string $line): bool => str_contains($line, ' checks, '),
));
guardCheck(
    'and the actions test itself passed',
    str_contains($allowed['stdout'], '0 failed'),
    trim($summary[0] ?? '(no summary)'),
);

/* --------------------------------------------------------------- report */

$failed = 0;
foreach ($results as $result) {
    $status = $result['ok'] ? 'ok  ' : 'FAIL';
    if (!$result['ok']) {
        $failed++;
    }
    $detail = $result['detail'] === '' ? '' : '  — ' . $result['detail'];
    echo "{$status} {$result['label']}{$detail}\n";
}

echo "\n" . count($results) . ' checks, ' . $failed . " failed\n";
exit($failed === 0 ? 0 : 1);
