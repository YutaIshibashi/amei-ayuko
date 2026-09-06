#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Creates or resets the single administrator account.
 *
 *   php ops/create-admin.php <username>
 *
 * The password is read from stdin (never from an argument, which would end up
 * in the shell history and in `ps`). Run it over SSH on the server, or locally
 * against the same database.
 */

// Repository layout: the app dir is backend/, not the deployed _app/.
putenv('AMEI_APP_DIR=' . (getenv('AMEI_APP_DIR') ?: dirname(__DIR__) . '/backend'));
require_once (getenv('AMEI_APP_DIR')) . '/bootstrap.php';

use Amei\Database;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This script is CLI only.\n");
    exit(1);
}

$username = $argv[1] ?? '';
if ($username === '') {
    fwrite(STDERR, "Usage: php ops/create-admin.php <username>\n");
    exit(1);
}

fwrite(STDOUT, "Password for '{$username}': ");
system('stty -echo 2>/dev/null');
$password = trim((string) fgets(STDIN));
system('stty echo 2>/dev/null');
fwrite(STDOUT, "\nConfirm: ");
system('stty -echo 2>/dev/null');
$confirm = trim((string) fgets(STDIN));
system('stty echo 2>/dev/null');
fwrite(STDOUT, "\n");

if ($password !== $confirm) {
    fwrite(STDERR, "Passwords do not match.\n");
    exit(1);
}
if (strlen($password) < 12) {
    fwrite(STDERR, "Use at least 12 characters.\n");
    exit(1);
}

$hash = password_hash($password, PASSWORD_DEFAULT);

Database::run(
    'INSERT INTO admin_users (username, password_hash) VALUES (:u, :h)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)',
    [':u' => $username, ':h' => $hash]
);

// Any active lockout would otherwise persist past a deliberate reset.
Database::run('DELETE FROM admin_login_attempts WHERE username = :u', [':u' => $username]);

fwrite(STDOUT, "Administrator '{$username}' is ready.\n");
