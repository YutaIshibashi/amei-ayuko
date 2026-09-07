<?php

declare(strict_types=1);

/**
 * GET /api/news/index.php?page=1
 *
 * Published articles, ten per page, newest first.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';

use Amei\Http;
use Amei\Maintenance;
use Amei\NewsRepository;
use Amei\Sanitizer;

Http::requireMethod('GET');
Maintenance::blockApi();

$page = max(1, (int) ($_GET['page'] ?? 1));
if ($page > 1000) {
    // Nothing legitimate paginates that far; cap it rather than scan.
    Http::error('invalid_page', 'ページ番号が正しくありません。', 400);
}

$result = NewsRepository::publicList($page);
$perPage = NewsRepository::PER_PAGE;
$totalPages = max(1, (int) ceil($result['total'] / $perPage));

$items = array_map(static function (array $row): array {
    $image = null;
    if (is_string($row['image_path'] ?? null) && $row['image_path'] !== '') {
        $image = [
            'url'    => (string) $row['image_path'],
            'width'  => (int) ($row['image_width'] ?? 1200),
            'height' => (int) ($row['image_height'] ?? 800),
        ];
    }

    return [
        'id'          => (int) $row['id'],
        'title'       => (string) $row['title'],
        'category'    => (string) $row['category'],
        'publishedAt' => (string) $row['published_at'],
        'updatedAt'   => is_string($row['content_updated_at'] ?? null) && $row['content_updated_at'] !== ''
            ? (string) $row['content_updated_at']
            : null,
        'image'       => $image,
        'excerpt'     => Sanitizer::excerpt((string) $row['body'], 90),
    ];
}, $result['items']);

Http::json([
    'items'      => $items,
    'page'       => $page,
    'perPage'    => $perPage,
    'total'      => $result['total'],
    'totalPages' => $totalPages,
], 200, 60);
