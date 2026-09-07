#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Verifies that every PHP entry point finds `_app/bootstrap.php` once deployed.
 *
 *   php backend/tests/release-layout-test.php
 *
 * The repository layout and the deployed layout are different shapes:
 * `backend/public/api/settings.php` becomes `<docroot>/api/settings.php`, and
 * `_app/` sits at the document root. So each entry point has to walk up as many
 * directories as it is deep *in the deployed tree* — a number that is invisible
 * while reading the repository, and wrong by one is a 500 on that endpoint and
 * nothing anywhere else.
 *
 * That is exactly what shipped: every file under `api/` used one level too
 * many, so `/api/settings.php` died on a missing require while `php -l`,
 * PHPStan and the whole test suite stayed green.
 *
 * This check builds the real release tree with ops/build-release.sh — the same
 * script the deploy uses — and then *runs* each entry point with a stub
 * bootstrap in place. Running it is the point: a static reading of the
 * `dirname()` count would just re-implement the bug. The stub exits
 * immediately, so no endpoint logic executes and no database is needed.
 */

$root = dirname(__DIR__, 2);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

/* ------------------------------------------------------ build the release */

$release = sys_get_temp_dir() . '/amei-release-' . bin2hex(random_bytes(6));

$command = escapeshellarg($root . '/ops/build-release.sh')
    . ' ' . escapeshellarg($release) . ' --no-frontend 2>&1';
exec($command, $output, $status);

if ($status !== 0) {
    fwrite(STDERR, "failed to assemble the release tree:\n" . implode("\n", $output) . "\n");
    exit(1);
}

register_shutdown_function(static function () use ($release): void {
    exec('rm -rf ' . escapeshellarg($release));
});

/* ------------------------------------------------- stub out the bootstrap */

$bootstrap = $release . '/_app/bootstrap.php';
if (!is_file($bootstrap)) {
    fwrite(STDERR, "the assembled release has no _app/bootstrap.php\n");
    exit(1);
}

// Reached only if the entry point's require resolved correctly. Exiting here
// stops the endpoint before it can touch a database, a session or headers.
file_put_contents($bootstrap, <<<'STUB'
<?php
echo "BOOTSTRAP_RESOLVED\n";
exit(0);
STUB);

/* ------------------------------------------------- find the entry points */

/** @return list<string> paths relative to the document root */
function entryPoints(string $release): array
{
    $found = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($release, FilesystemIterator::SKIP_DOTS),
    );

    foreach ($iterator as $file) {
        /** @var SplFileInfo $file */
        if ($file->getExtension() !== 'php') {
            continue;
        }
        $relative = substr($file->getPathname(), strlen($release) + 1);

        // _app/ is application internals, not an entry point, and is denied
        // by .htaccess anyway.
        if (str_starts_with($relative, '_app/')) {
            continue;
        }
        // `_name.php` is the convention for a partial included by its
        // siblings (_layout.php, _auth.php). They are not entry points, and
        // .htaccess denies them over HTTP.
        if (str_starts_with(basename($relative), '_')) {
            continue;
        }
        $found[] = $relative;
    }

    sort($found);
    return $found;
}

$entries = entryPoints($release);

if (count($entries) < 20) {
    // Guards against the walk silently finding nothing and the test passing
    // vacuously. There are ~28 entry points; well under 20 means something is
    // wrong with the assembly, not with the paths.
    fwrite(STDERR, sprintf("only %d entry points found — assembly looks wrong\n", count($entries)));
    exit(1);
}

/* --------------------------------- every entry point must load the bootstrap */

// Catches the opposite mistake: a new endpoint that forgets to require it at
// all would otherwise be reported as passing, since nothing would fail.
$missing = [];
foreach ($entries as $relative) {
    $source = (string) file_get_contents($release . '/' . $relative);
    if (!str_contains($source, "/_app/bootstrap.php'")) {
        $missing[] = $relative;
    }
}
if ($missing !== []) {
    fwrite(STDERR, "these entry points never require the bootstrap:\n");
    foreach ($missing as $relative) {
        fwrite(STDERR, "  {$relative}\n");
    }
    exit(1);
}

/* --------------------------------------------------------------- run them */

printf("PHP %s\n", PHP_VERSION);
printf("%d entry points in the assembled release\n\n", count($entries));

$failed = 0;

foreach ($entries as $relative) {
    $absolute = $release . '/' . $relative;

    // PHP_BINARY, not `php` from PATH: the CI matrix runs this on 8.2 and 8.5,
    // and each run has to exercise the interpreter it was started with.
    exec(
        escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($absolute) . ' 2>&1',
        $lines,
        $exitCode,
    );
    $out = implode("\n", $lines);
    $lines = [];

    $ok = str_contains($out, 'BOOTSTRAP_RESOLVED');
    if (!$ok) {
        $failed++;
    }

    printf("%-5s %s\n", $ok ? 'ok' : 'FAIL', $relative);

    if (!$ok) {
        // The message names the path it tried, which is what identifies the
        // wrong dirname() depth.
        foreach (array_slice(explode("\n", $out), 0, 3) as $line) {
            if (trim($line) !== '') {
                printf("      %s\n", trim($line));
            }
        }
    }
}

printf("\n%d entry points, %d failed\n", count($entries), $failed);
exit($failed === 0 ? 0 : 1);
