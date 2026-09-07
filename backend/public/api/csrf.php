<?php

declare(strict_types=1);

/**
 * GET /api/csrf.php
 *
 * Issues the session-bound CSRF token used by the contact form. Because the
 * frontend is a static bundle, the token cannot be embedded at build time — it
 * is fetched once when the form mounts, and again after a failed submission.
 */

require_once dirname(__DIR__) . '/_app/bootstrap.php';

use Amei\Csrf;
use Amei\Http;
use Amei\Maintenance;

Http::requireMethod('GET');
Maintenance::blockApi();

// Never cached: the token is tied to this visitor's session cookie.
Http::json(['token' => Csrf::token()], 200, 0);
