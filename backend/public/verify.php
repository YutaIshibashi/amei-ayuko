<?php

declare(strict_types=1);

/**
 * Google Search Console site verification, HTML-file method.
 *
 * Apache rewrites `/google<token>.html` here. Serving the file from the
 * database rather than committing it means the token can be rotated from the
 * admin screen without a deploy — and there is no stray verification file
 * left behind in the repository if the property is ever removed.
 *
 * The DNS TXT method also works and needs none of this; see the README.
 */

require_once __DIR__ . '/_app/bootstrap.php';

use Amei\Settings;

$requested = (string) ($_GET['token'] ?? '');
$configured = trim(Settings::get('search_console_verification', ''));

header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

// Compared with hash_equals out of habit rather than necessity: the token is
// public, but constant-time comparison costs nothing here.
if ($configured === '' || $requested === '' || !hash_equals($configured, $requested)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    echo "Not Found\n";
    exit;
}

header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: public, max-age=300');
echo 'google-site-verification: google' . $configured . ".html\n";
