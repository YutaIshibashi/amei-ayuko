<?php

declare(strict_types=1);

/**
 * GET /api/news/detail.php?id=123
 *
 * One published article, including its sanitised body and — when the product
 * still exists in the current catalogue — the related product card.
 */

require_once dirname(__DIR__, 3) . '/_app/bootstrap.php';

use Amei\Http;
use Amei\Maintenance;
use Amei\NewsRepository;
use Amei\ProductRepository;
use Amei\Sanitizer;

Http::requireMethod('GET');
Maintenance::blockApi();

$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) {
    Http::error('not_found', '記事が見つかりませんでした。', 404);
}

$row = NewsRepository::publicFind($id);
if ($row === null) {
    Http::error('not_found', '記事が見つかりませんでした。', 404);
}

$image = null;
if (is_string($row['image_path'] ?? null) && $row['image_path'] !== '') {
    $image = [
        'url'    => (string) $row['image_path'],
        'width'  => (int) ($row['image_width'] ?? 1200),
        'height' => (int) ($row['image_height'] ?? 800),
    ];
}

// A product removed from minne makes the CTA disappear, but the article stays
// published — the administrator decides what to do with it, not the sync job.
$related = null;
$relatedId = (string) ($row['related_product_id'] ?? '');
if ($relatedId !== '') {
    $product = ProductRepository::find($relatedId);
    if ($product !== null) {
        $images = (array) ($product['images'] ?? []);
        $first = $images[0] ?? null;
        $related = [
            'id'       => (string) $product['id'],
            'name'     => (string) $product['name'],
            'category' => (string) $product['category'],
            'thumb'    => is_array($first) ? (string) ($first['thumb'] ?? '') : null,
            'price'    => (int) $product['price'],
        ];
    }
}

Http::json([
    'id'             => (int) $row['id'],
    'title'          => (string) $row['title'],
    'category'       => (string) $row['category'],
    'publishedAt'    => (string) $row['published_at'],
    'updatedAt'      => is_string($row['content_updated_at'] ?? null) && $row['content_updated_at'] !== ''
        ? (string) $row['content_updated_at']
        : null,
    'image'          => $image,
    'excerpt'        => Sanitizer::excerpt((string) $row['body'], 120),
    // Already sanitised against the allow-list before it was stored.
    'body'           => (string) $row['body'],
    'relatedProduct' => $related,
], 200, 60);
