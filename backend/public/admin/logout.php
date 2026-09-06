<?php

declare(strict_types=1);

/** Admin logout. POST only, so a stray link cannot sign the user out. */

require_once dirname(__DIR__) . '/_app/bootstrap.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\Http;
use Amei\Session;

Http::requireMethod('POST');
Session::start();
Csrf::requirePost();

Auth::logout();

header('Location: /admin/login.php');
exit;
