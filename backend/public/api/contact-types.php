<?php

declare(strict_types=1);

/**
 * GET /api/contact-types.php
 *
 * The enquiry categories shown in the contact form's select, in the order the
 * administrator arranged them.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';

use Amei\Database;
use Amei\Http;
use Amei\Maintenance;

Http::requireMethod('GET');
Maintenance::blockApi();

$rows = Database::all(
    'SELECT id, label, help_text FROM contact_types
     WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
);

$types = array_map(
    static fn (array $row): array => [
        'id'       => (int) $row['id'],
        'label'    => (string) $row['label'],
        'helpText' => (string) $row['help_text'],
    ],
    $rows
);

Http::json(['types' => $types], 200, 300);
