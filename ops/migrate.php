#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Migration helper — for local development and for checking production state.
 *
 *   php ops/migrate.php status    # what is applied, what is pending
 *   php ops/migrate.php up        # apply pending migrations (local use)
 *
 * Production migrations are applied by hand through phpMyAdmin, by design:
 * deploys must never alter the schema on their own. `status` is still useful
 * against production to confirm what has been applied.
 */

/**
 * Works from either layout without being told which:
 *   repository … ops/            → app dir is ../backend
 *   deployed   … _app/ops/       → app dir is ..
 * AMEI_APP_DIR still wins if it is set explicitly.
 */
$appDir = getenv('AMEI_APP_DIR') ?: null;
if ($appDir === null) {
    $deployed = dirname(__DIR__);                 // _app/
    $repo = dirname(__DIR__) . '/backend';        // backend/
    $appDir = is_file($deployed . '/bootstrap.php') ? $deployed : $repo;
}
putenv('AMEI_APP_DIR=' . $appDir);
require_once $appDir . '/bootstrap.php';

use Amei\Database;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script is CLI only.\n");
    exit(1);
}

// Migrations are not deployed (they are applied by hand through phpMyAdmin),
// so on the server this directory simply will not exist. `status` still works
// there: it reports what the database says has been applied.
$migrationsDir = is_dir(dirname(__DIR__) . '/backend/migrations')
    ? dirname(__DIR__) . '/backend/migrations'
    : $appDir . '/migrations';
$command = $argv[1] ?? 'status';

$files = array_values(array_filter(
    glob($migrationsDir . '/*.sql') ?: [],
    static fn (string $path): bool => !str_contains(basename($path), '.rollback.')
));
sort($files);

$applied = [];
try {
    foreach (Database::all('SELECT migration_name FROM migration_history') as $row) {
        $applied[(string) $row['migration_name']] = true;
    }
} catch (\Throwable) {
    fwrite(STDOUT, "migration_history does not exist yet — run 001_initial.sql first.\n");
}

if ($command === 'status') {
    if ($files === []) {
        fwrite(STDOUT, "No migration files here (expected on the server).\n");
        fwrite(STDOUT, "Applied according to the database:\n");
        foreach (array_keys($applied) as $name) {
            fwrite(STDOUT, "  {$name}\n");
        }
        exit(0);
    }
    foreach ($files as $file) {
        $name = basename($file);
        fwrite(STDOUT, sprintf("%-40s %s\n", $name, isset($applied[$name]) ? 'applied' : 'PENDING'));
    }
    exit(0);
}

if ($command !== 'up') {
    fwrite(STDERR, "Unknown command: {$command}\n");
    exit(1);
}

if (\Amei\Config::isProduction()) {
    fwrite(STDERR, "Refusing to run migrations automatically in production.\n");
    fwrite(STDERR, "Apply them through phpMyAdmin, then verify with `status`.\n");
    exit(1);
}

foreach ($files as $file) {
    $name = basename($file);
    if (isset($applied[$name])) {
        continue;
    }
    fwrite(STDOUT, "Applying {$name} …\n");
    $sql = (string) file_get_contents($file);
    Database::pdo()->exec($sql);
    Database::run(
        'INSERT IGNORE INTO migration_history (migration_name) VALUES (:n)',
        [':n' => $name]
    );
}

fwrite(STDOUT, "Done.\n");
