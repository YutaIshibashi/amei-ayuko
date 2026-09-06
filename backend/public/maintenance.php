<?php

declare(strict_types=1);

/**
 * Front controller for maintenance mode.
 *
 * `.htaccess` routes every public request here while `maintenance.flag`
 * exists. The admin area and the flag file itself are excluded, so the site
 * can always be brought back up.
 */

require_once __DIR__ . '/_app/bootstrap.php';

use Amei\Maintenance;

Maintenance::renderPage();
