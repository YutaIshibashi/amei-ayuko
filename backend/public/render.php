<?php

declare(strict_types=1);

/**
 * Crawler-facing renderer for URLs a static export cannot pre-generate.
 *
 * Apache routes two shapes here:
 *   /news/{id}                        → the article shell
 *   /shop/?…&product={id}             → the shop shell with a product open
 *
 * In both cases the *same* exported Next.js document is returned, so the
 * visitor-facing UI is untouched; only <head> is rewritten, with the title,
 * description, canonical, OGP and structured data for that specific URL, plus
 * a <noscript> summary. The React app hydrates and takes over as usual.
 *
 * An unknown id answers 404 with the exported 404 document, so a dead product
 * or article URL is a real 404 for search engines, not a soft one.
 */

require_once __DIR__ . '/_app/bootstrap.php';

use Amei\Config;
use Amei\Http;
use Amei\Logger;
use Amei\Maintenance;
use Amei\NewsRepository;
use Amei\ProductRepository;
use Amei\Sanitizer;
use Amei\Seo;
use Amei\Settings;

if (Maintenance::isActive()) {
    Maintenance::renderPage();
}

$siteUrl = Config::siteUrl();
$type = $_GET['__render'] ?? '';

/**
 * Sends an exported document, optionally with an injected head.
 *
 * @param array{title: string, description: string, canonical: string,
 *              ogType?: string, ogImage?: string, ogImageAlt?: string,
 *              robots?: string, jsonLd?: list<array<string, mixed>>,
 *              noscript?: string}|null $meta
 */
function serve(string $relativePath, ?array $meta, int $status = 200): never
{
    $file = WEB_ROOT . '/' . ltrim($relativePath, '/');
    if (!is_readable($file)) {
        // The export is missing: fail loudly in the log, softly in the browser.
        Logger::error(Logger::CHANNEL_APP, 'Export shell not found', ['path' => $relativePath]);
        http_response_code(500);
        exit;
    }

    $html = (string) file_get_contents($file);
    if ($meta !== null) {
        $html = Seo::inject($html, $meta);
    }

    http_response_code($status);
    Http::securityHeaders(true);
    header('Content-Type: text/html; charset=UTF-8');
    header('Vary: Accept-Encoding');
    header($status === 200
        // Short public cache: product and news content changes on its own
        // schedule, and a stale head for a minute is harmless.
        ? 'Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600'
        : 'Cache-Control: no-store');

    echo $html;
    exit;
}

function notFound(): never
{
    serve('404.html', null, 404);
}

/* ------------------------------------------------------------------ news */
if ($type === 'news') {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        notFound();
    }

    $article = NewsRepository::publicFind($id);
    if ($article === null) {
        notFound();
    }

    $canonical = $siteUrl . '/news/' . $id;
    $title = Seo::clean((string) $article['title'], 60);
    $description = Sanitizer::excerpt((string) $article['body'], 150);
    $ogImage = is_string($article['image_path'] ?? null) && $article['image_path'] !== ''
        ? Seo::absolute((string) $article['image_path'], $siteUrl)
        : Seo::absolute(Settings::get('ogp_image', '/brand/ogp-default.png'), $siteUrl);

    $noscript = '<article><h1>' . Sanitizer::e($title) . '</h1>'
        . '<p>' . Sanitizer::e(date('Y年n月j日', strtotime((string) $article['published_at']) ?: time())) . '｜'
        . Sanitizer::e(NewsRepository::categoryLabel((string) $article['category'])) . '</p>'
        // Already sanitised against the allow-list when it was stored.
        . (string) $article['body']
        . '<p><a href="' . Sanitizer::e($siteUrl) . '/news/">お知らせ一覧へ</a></p></article>';

    serve('news/detail/index.html', [
        'title'       => $title . ' | amei ayuko',
        'description' => $description,
        'canonical'   => $canonical,
        'ogType'      => 'article',
        'ogImage'     => $ogImage,
        'ogImageAlt'  => $title,
        'noscript'    => $noscript,
        'jsonLd'      => [
            Seo::articleJsonLd($article, $canonical),
            Seo::breadcrumbJsonLd([
                ['name' => 'ホーム',   'url' => $siteUrl . '/'],
                ['name' => 'お知らせ', 'url' => $siteUrl . '/news/'],
                ['name' => $title,     'url' => $canonical],
            ]),
        ],
    ]);
}

/* --------------------------------------------------------------- product */
if ($type === 'product') {
    $productId = (string) ($_GET['product'] ?? '');
    if ($productId === '') {
        notFound();
    }

    $product = ProductRepository::find($productId);
    if ($product === null) {
        notFound();
    }

    // The product's own category is authoritative; a mismatched ?category= in
    // the request is corrected here (and again client-side via replaceState).
    $category = (string) $product['category'];
    $canonical = $siteUrl . '/shop/?category=' . rawurlencode($category)
        . '&product=' . rawurlencode($productId);

    $name = Seo::clean((string) $product['name'], 60);
    $categoryLabel = ProductRepository::categoryLabel($category);
    $price = number_format((int) $product['price']);

    // Product-intent keywords, not just the brand name.
    $title = $name . '｜' . $categoryLabel . ' | amei ayuko';
    $description = Seo::clean(
        $name . '（' . $categoryLabel . '／' . $price . '円）。'
        . '手描きの' . $categoryLabel . 'で、子どもの成長記録やアルバムづくりに。'
        . Sanitizer::excerpt((string) $product['description'], 90),
        155
    );

    $images = (array) ($product['images'] ?? []);
    $firstImage = $images[0] ?? null;
    $ogImage = is_array($firstImage)
        ? Seo::absolute((string) ($firstImage['large'] ?? ''), $siteUrl)
        : Seo::absolute(Settings::get('ogp_image', '/brand/ogp-default.png'), $siteUrl);

    $noscript = '<article><h1>' . Sanitizer::e($name) . '</h1>'
        . '<p>' . Sanitizer::e($categoryLabel) . '／' . Sanitizer::e($price) . '円</p>'
        . '<p style="white-space:pre-wrap">' . Sanitizer::e((string) $product['description']) . '</p>'
        . '<p><a href="' . Sanitizer::e((string) $product['url']) . '" rel="noopener">minneで購入する</a></p>'
        . '</article>';

    serve('shop/index.html', [
        'title'       => $title,
        'description' => $description,
        'canonical'   => $canonical,
        'ogType'      => 'product',
        'ogImage'     => $ogImage,
        'ogImageAlt'  => $name,
        'noscript'    => $noscript,
        'jsonLd'      => [
            Seo::productJsonLd($product, $canonical),
            // Not shown in the UI, but it improves the search result itself.
            Seo::breadcrumbJsonLd([
                ['name' => 'ホーム',         'url' => $siteUrl . '/'],
                ['name' => 'オンラインショップ', 'url' => $siteUrl . '/shop/'],
                ['name' => $categoryLabel,   'url' => $siteUrl . '/shop/?category=' . rawurlencode($category)],
                ['name' => $name,            'url' => $canonical],
            ]),
        ],
    ]);
}

notFound();
