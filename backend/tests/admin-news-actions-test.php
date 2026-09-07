#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * The admin news list's POST actions, driven over real HTTP.
 *
 *   php backend/tests/admin-news-actions-test.php
 *
 * Requires a MySQL/MariaDB database (CI provides one; see ci.yml).
 *
 * This exists because of a bug that no unit test would have caught: "新規作成"
 * posted correctly, the handler gated every action on a positive `id`, and
 * `create` has no id yet — so the request fell through to the redirect and the
 * button appeared to do nothing at all. Nothing threw, nothing was logged, and
 * the page looked normal.
 *
 * So the check has to be the real thing: a release tree, PHP's built-in
 * server, a genuine login, and a genuine CSRF token.
 */

$root = dirname(__DIR__, 2);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

/** @var list<array{label: string, ok: bool, detail: string}> $results */
$results = [];

function adminCheck(string $label, bool $ok, string $detail = ''): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok, 'detail' => $detail];
}

/* ------------------------------------------------------- the release tree */

$release = sys_get_temp_dir() . '/amei-admin-' . bin2hex(random_bytes(6));
exec(
    escapeshellarg($root . '/ops/build-release.sh') . ' ' . escapeshellarg($release) . ' --no-frontend 2>&1',
    $buildOutput,
    $buildStatus,
);
if ($buildStatus !== 0) {
    fwrite(STDERR, "failed to assemble the release tree:\n" . implode("\n", $buildOutput) . "\n");
    exit(1);
}

$dbName = getenv('DB_NAME') ?: 'amei_test';
if (!str_contains($dbName, 'test')) {
    fwrite(STDERR, "refusing to run against '{$dbName}': the name must contain 'test'\n");
    exit(1);
}

file_put_contents($release . '/_app/.env', implode("\n", [
    'APP_ENV=testing',
    'SITE_URL=http://127.0.0.1',
    'APP_SECRET=admin-actions-test-secret',
    'DB_HOST=' . (getenv('DB_HOST') ?: '127.0.0.1'),
    'DB_PORT=' . (getenv('DB_PORT') ?: '3306'),
    'DB_NAME=' . $dbName,
    'DB_USER=' . (getenv('DB_USER') ?: 'amei'),
    'DB_PASSWORD=' . (getenv('DB_PASSWORD') ?: 'amei-test'),
]) . "\n");

/* ---------------------------------------------------- schema and fixtures */

putenv('AMEI_APP_DIR=' . $root . '/backend');
putenv('AMEI_WEB_ROOT=' . $release);
require $root . '/backend/bootstrap.php';

use Amei\Database;
use Amei\NewsRepository;

try {
    Database::value('SELECT COUNT(*) FROM news');
} catch (\Throwable) {
    Database::pdo()->exec((string) file_get_contents($root . '/backend/migrations/001_initial.sql'));
}

Database::run('DELETE FROM news');
Database::run('DELETE FROM admin_login_attempts');
Database::run('DELETE FROM admin_users');

$password = 'admin-actions-test-password';
Database::run(
    'INSERT INTO admin_users (username, password_hash) VALUES (:u, :h)',
    [':u' => 'tester', ':h' => password_hash($password, PASSWORD_DEFAULT)],
);

/* --------------------------------------------------------- the web server */

// A free port chosen by the OS, so parallel jobs cannot collide on it.
$probe = stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
if ($probe === false) {
    fwrite(STDERR, "could not reserve a port: {$errstr}\n");
    exit(1);
}
$name = stream_socket_get_name($probe, false);
$port = (int) substr((string) $name, strrpos((string) $name, ':') + 1);
fclose($probe);

$serverLog = $release . '/server.log';
$descriptors = [1 => ['file', $serverLog, 'a'], 2 => ['file', $serverLog, 'a']];
$server = proc_open(
    [PHP_BINARY, '-S', "127.0.0.1:{$port}", '-t', $release],
    $descriptors,
    $pipes,
);
if (!is_resource($server)) {
    fwrite(STDERR, "could not start the built-in server\n");
    exit(1);
}

register_shutdown_function(static function () use ($server, $release): void {
    if (is_resource($server)) {
        proc_terminate($server);
        proc_close($server);
    }
    exec('rm -rf ' . escapeshellarg($release));
});

// Wait for it to accept connections.
$ready = false;
for ($i = 0; $i < 50; $i++) {
    $socket = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.2);
    if ($socket !== false) {
        fclose($socket);
        $ready = true;
        break;
    }
    usleep(100_000);
}
if (!$ready) {
    fwrite(STDERR, "the built-in server never came up\n");
    exit(1);
}

/* ------------------------------------------------------- a tiny HTTP client */

/** @var array<string, string> $cookies */
$cookies = [];

/**
 * One request, with a cookie jar and redirects left alone.
 *
 * curl rather than file_get_contents: reading the response headers that way
 * needs `$http_response_header`, which PHP 8.5 deprecates at compile time —
 * so no runtime guard can keep both 8.2 and 8.5 quiet.
 *
 * @param array<string, string>|null $post
 * @return array{status: int, headers: array<string, string>, body: string}
 */
function http(string $path, ?array $post = null): array
{
    global $cookies, $port;

    $handle = curl_init("http://127.0.0.1:{$port}{$path}");
    if ($handle === false) {
        throw new \RuntimeException('cannot initialise curl');
    }

    $headers = [];
    if ($cookies !== []) {
        $pairs = [];
        foreach ($cookies as $name => $value) {
            $pairs[] = "{$name}={$value}";
        }
        $headers[] = 'Cookie: ' . implode('; ', $pairs);
    }

    $received = [];
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        // Redirects are the thing under test, so they must not be followed.
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADERFUNCTION => static function ($_handle, string $line) use (&$received): int {
            $received[] = $line;
            return strlen($line);
        },
    ]);

    if ($post !== null) {
        curl_setopt($handle, CURLOPT_POST, true);
        curl_setopt($handle, CURLOPT_POSTFIELDS, http_build_query($post));
    }

    $body = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);

    $parsed = [];
    foreach ($received as $line) {
        $pos = strpos($line, ':');
        if ($pos === false) {
            continue;
        }
        $name = strtolower(trim(substr($line, 0, $pos)));
        $value = trim(substr($line, $pos + 1));

        if ($name === 'set-cookie') {
            $pair = explode(';', $value, 2)[0];
            [$cookieName, $cookieValue] = array_pad(explode('=', $pair, 2), 2, '');
            $cookies[trim($cookieName)] = trim($cookieValue);
            continue;
        }
        $parsed[$name] = $value;
    }

    return ['status' => $status, 'headers' => $parsed, 'body' => is_string($body) ? $body : ''];
}

function csrfTokenFrom(string $html): string
{
    return preg_match('/name="csrf_token" value="([^"]+)"/', $html, $m) === 1 ? $m[1] : '';
}

/* ------------------------------------------------------------------ log in */

$loginPage = http('/admin/login.php');
$token = csrfTokenFrom($loginPage['body']);
adminCheck('the login page issues a CSRF token', $token !== '');

$login = http('/admin/login.php', [
    'csrf_token' => $token,
    'username' => 'tester',
    'password' => $password,
]);
adminCheck(
    'logging in succeeds',
    $login['status'] === 302 && str_contains($login['headers']['location'] ?? '', '/admin/'),
    (string) $login['status'] . ' → ' . ($login['headers']['location'] ?? '(no redirect)'),
);

$listPage = http('/admin/news/');
$listToken = csrfTokenFrom($listPage['body']);
adminCheck('the news list renders for a logged-in admin', $listPage['status'] === 200 && $listToken !== '');

/* ----------------------------------------------- create, with no id at all */

$before = (int) Database::value('SELECT COUNT(*) FROM news');

// Exactly what the button posts: an action and a token, and no id.
$created = http('/admin/news/', ['csrf_token' => $listToken, 'action' => 'create']);

adminCheck(
    'creating a draft without an id redirects',
    $created['status'] === 302,
    (string) $created['status'],
);

$location = $created['headers']['location'] ?? '';
adminCheck(
    'and lands on the editor for the new draft',
    preg_match('#^/admin/news/edit\.php\?id=(\d+)$#', $location, $m) === 1,
    $location === '' ? '(no redirect)' : $location,
);

$newId = isset($m[1]) ? (int) $m[1] : 0;

adminCheck(
    'a draft row is actually created',
    (int) Database::value('SELECT COUNT(*) FROM news') === $before + 1,
);

$draft = $newId > 0 ? NewsRepository::find($newId) : null;
adminCheck(
    'the new row is a draft',
    $draft !== null && $draft['status'] === 'draft',
    $draft === null ? '(not found)' : (string) $draft['status'],
);

$editor = http('/admin/news/edit.php?id=' . $newId);
adminCheck('the editor opens for it', $editor['status'] === 200);

/* -------------------------------------------------------------- CSRF holds */

$noToken = http('/admin/news/', ['action' => 'create']);
adminCheck(
    'creating without a CSRF token is rejected',
    $noToken['status'] === 419,
    (string) $noToken['status'],
);

$badToken = http('/admin/news/', ['csrf_token' => 'not-the-token', 'action' => 'create']);
adminCheck(
    'creating with a wrong CSRF token is rejected',
    $badToken['status'] === 419,
    (string) $badToken['status'],
);

adminCheck(
    'and neither attempt created anything',
    (int) Database::value('SELECT COUNT(*) FROM news') === $before + 1,
);

/* ------------------------------------- the id-bearing actions still need one */

$listPage = http('/admin/news/');
$listToken = csrfTokenFrom($listPage['body']);

foreach (['publish', 'unpublish', 'delete'] as $action) {
    $statusBefore = (string) Database::value('SELECT status FROM news WHERE id = :id', [':id' => $newId]);

    $response = http('/admin/news/', ['csrf_token' => $listToken, 'action' => $action]);
    adminCheck(
        "{$action} without an id redirects back to the list",
        $response['status'] === 302
            && str_starts_with($response['headers']['location'] ?? '', '/admin/news/?'),
        $response['headers']['location'] ?? '(no redirect)',
    );

    adminCheck(
        "{$action} without an id changes nothing",
        (string) Database::value('SELECT status FROM news WHERE id = :id', [':id' => $newId]) === $statusBefore
            && Database::value('SELECT deleted_at FROM news WHERE id = :id', [':id' => $newId]) === null,
    );
}

/* ------------------------------------------- and still work with a real one */

http('/admin/news/', ['csrf_token' => $listToken, 'action' => 'publish', 'id' => (string) $newId]);
adminCheck(
    'publish with a valid id still works',
    (string) Database::value('SELECT status FROM news WHERE id = :id', [':id' => $newId]) === 'published',
);

http('/admin/news/', ['csrf_token' => $listToken, 'action' => 'unpublish', 'id' => (string) $newId]);
adminCheck(
    'unpublish with a valid id still works',
    (string) Database::value('SELECT status FROM news WHERE id = :id', [':id' => $newId]) === 'private',
);

http('/admin/news/', ['csrf_token' => $listToken, 'action' => 'delete', 'id' => (string) $newId]);
adminCheck(
    'delete with a valid id still soft-deletes',
    Database::value('SELECT deleted_at FROM news WHERE id = :id', [':id' => $newId]) !== null,
);

/* ----------------------------------------------------------------- result */

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
