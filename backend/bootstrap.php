<?php

declare(strict_types=1);

/**
 * Application bootstrap.
 *
 * This file lives in the private application directory (`_app/` by default),
 * which is denied to the web server. Every public entry point requires it
 * before doing anything else.
 */

// --- Paths ------------------------------------------------------------------
// APP_DIR  : the private application directory — src, vendor, templates,
//            storage and .env. Deployed to `<web root>/_app/`, which Apache
//            denies (see backend/public/_app/.htaccess).
// WEB_ROOT : the document root Apache serves.
//
// Both can be overridden by environment variables. That is what the local dev
// server and the CLI tools in ops/ use, since the repository layout is not the
// deployed layout.
define('APP_DIR', rtrim(getenv('AMEI_APP_DIR') ?: __DIR__, '/'));
define('WEB_ROOT', rtrim(getenv('AMEI_WEB_ROOT') ?: dirname(APP_DIR), '/'));
define('STORAGE_DIR', APP_DIR . '/storage');

require_once APP_DIR . '/vendor/autoload.php';

use Amei\Config;
use Amei\ErrorHandler;

// --- Runtime defaults -------------------------------------------------------
date_default_timezone_set('Asia/Tokyo');
mb_internal_encoding('UTF-8');
setlocale(LC_ALL, 'ja_JP.UTF-8', 'C.UTF-8', 'C');

Config::load(APP_DIR . '/.env');

// Never render PHP notices into a response: they leak paths and query shapes.
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

ErrorHandler::register();
