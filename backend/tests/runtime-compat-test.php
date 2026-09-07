#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Runtime compatibility checks.
 *
 *   php backend/tests/runtime-compat-test.php
 *
 * These exist because of a production outage: PHP 8.5 deprecated
 * PDO::MYSQL_ATTR_INIT_COMMAND, the error handler turned that deprecation into
 * an exception, and every database-backed endpoint started returning 500 —
 * while CI, pinned to 8.2, stayed green.
 *
 * The checks need no database and no network. What they verify is *which*
 * failure comes out, and that the request survives a deprecation at all. Run
 * on every PHP version the project claims to support; that matrix is what
 * makes them worth having.
 */

$root = dirname(__DIR__, 2);
putenv('AMEI_APP_DIR=' . $root . '/backend');
putenv('AMEI_WEB_ROOT=' . $root . '/frontend/out');

// Point at a port nothing is listening on: the connection must be *attempted*
// and fail on the socket, rather than dying earlier on a language diagnostic.
putenv('DB_HOST=127.0.0.1');
putenv('DB_PORT=59999');
putenv('DB_NAME=amei_compat_check');
putenv('DB_USER=amei');
putenv('DB_PASSWORD=unused');

require $root . '/backend/bootstrap.php';

use Amei\Database;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

/**
 * Results are collected and counted at the end, matching seo-inject-test.php.
 *
 * @var list<array{label: string, ok: bool, detail: string}> $results
 */
$results = [];

function compatCheck(string $label, bool $ok, string $detail = ''): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

printf("PHP %s\n\n", PHP_VERSION);

/* ------------------------------------------------------- database connect */

$thrown = null;
try {
    Database::pdo();
} catch (\Throwable $e) {
    $thrown = $e;
}

compatCheck('connecting throws something', $thrown !== null);

// The specific failure mode of the outage: a deprecation raised before the
// driver was ever contacted.
compatCheck(
    'no PHP diagnostic became an exception',
    !$thrown instanceof \ErrorException,
    $thrown instanceof \ErrorException ? $thrown->getMessage() : '',
);

compatCheck(
    'the connection was actually attempted',
    $thrown instanceof \RuntimeException && $thrown->getMessage() === 'database_unavailable',
    $thrown === null ? 'nothing thrown' : get_class($thrown) . ': ' . $thrown->getMessage(),
);

// The cause must survive, or a genuine connection problem is undiagnosable.
compatCheck(
    'the driver error is preserved as the previous exception',
    $thrown?->getPrevious() instanceof \PDOException,
);

/* ------------------------------------------------ deprecations are not fatal */

$survived = false;
try {
    // Any user-land deprecation exercises the same handler path that
    // PDO::MYSQL_ATTR_INIT_COMMAND took.
    trigger_error('synthetic deprecation for the compatibility check', E_USER_DEPRECATED);
    $survived = true;
} catch (\Throwable $e) {
    $survived = false;
}

compatCheck('a deprecation does not abort the request', $survived);

// Only deprecations were relaxed. A warning still has to fail loudly, or the
// handler has quietly become a way to ignore real problems.
$warningThrew = false;
try {
    trigger_error('synthetic warning for the compatibility check', E_USER_WARNING);
} catch (\ErrorException) {
    $warningThrew = true;
}
compatCheck('a warning still throws', $warningThrew);

// `@` must keep meaning "ignore this", for both kinds.
$suppressedWarningThrew = false;
try {
    @trigger_error('suppressed warning', E_USER_WARNING);
} catch (\ErrorException) {
    $suppressedWarningThrew = true;
}
compatCheck('suppression with @ is still honoured', !$suppressedWarningThrew);

/* ------------------------------------------------------------------ result */

$failed = 0;
foreach ($results as $result) {
    if (!$result['ok']) {
        $failed++;
    }
    printf(
        "%-5s %s%s\n",
        $result['ok'] ? 'ok' : 'FAIL',
        $result['label'],
        $result['detail'] === '' ? '' : "  ({$result['detail']})",
    );
}

printf("\n%d checks, %d failed\n", count($results), $failed);
exit($failed === 0 ? 0 : 1);
