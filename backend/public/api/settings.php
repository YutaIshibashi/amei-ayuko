<?php

declare(strict_types=1);

/**
 * GET /api/settings.php
 *
 * Editable site settings for the frontend shell. Public data only — the GA4
 * measurement id and the shop URLs are meant to be in the page anyway.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';

use Amei\Http;
use Amei\Maintenance;
use Amei\Settings;

Http::requireMethod('GET');
Maintenance::blockApi();

// Short cache: an editor's change should show up quickly, but every visitor
// hitting the database on every page view is pointless.
Http::json(Settings::publicPayload(), 200, 60);
