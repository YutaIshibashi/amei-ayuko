<?php

declare(strict_types=1);

/**
 * Router for PHP's built-in server (development only).
 *
 * Reproduces the .htaccess rewrites that matter during development:
 * pretty URLs for the static export, /news/{id} and /shop/?product= through
 * render.php, and /sitemap.xml.
 */

$root = __DIR__ . '/../.dev-root';
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

// Serve real files as-is.
$file = $root . $uri;
if ($uri !== '/' && is_file($file)) {
    return false;
}

// /news/{id}
if (preg_match('#^/news/(\d+)/?$#', $uri, $m) === 1) {
    $_GET['__render'] = 'news';
    $_GET['id'] = $m[1];
    require $root . '/render.php';
    return true;
}

// /shop/?…&product=…
if (preg_match('#^/shop/?$#', $uri) === 1 && isset($_GET['product'])) {
    $_GET['__render'] = 'product';
    require $root . '/render.php';
    return true;
}

if ($uri === '/sitemap.xml') {
    require $root . '/sitemap.php';
    return true;
}

// Directory index for the exported routes.
$index = rtrim($root . $uri, '/') . '/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($index);
    return true;
}

if ($uri === '/' && is_file($root . '/index.html')) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($root . '/index.html');
    return true;
}

http_response_code(404);
if (is_file($root . '/404.html')) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($root . '/404.html');
    return true;
}
echo 'Not Found';
return true;
