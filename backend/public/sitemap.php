<?php

declare(strict_types=1);

/**
 * /sitemap.xml (rewritten to this file).
 *
 * Generated rather than exported, because the product and article URLs only
 * exist in the database and the synced catalogue.
 */

require_once __DIR__ . '/_app/bootstrap.php';

use Amei\Config;
use Amei\Database;
use Amei\ProductRepository;
use Amei\Seo;

header('Content-Type: application/xml; charset=UTF-8');
header('Cache-Control: public, max-age=3600');
header('X-Content-Type-Options: nosniff');

$siteUrl = Config::siteUrl();
$today = date('Y-m-d');

/** @var list<array{loc: string, lastmod: string, changefreq: string, priority: string}> $urls */
$urls = [
    ['loc' => $siteUrl . '/',                'lastmod' => $today, 'changefreq' => 'weekly',  'priority' => '1.0'],
    ['loc' => $siteUrl . '/shop/',           'lastmod' => $today, 'changefreq' => 'daily',   'priority' => '0.9'],
    ['loc' => $siteUrl . '/about/',          'lastmod' => $today, 'changefreq' => 'monthly', 'priority' => '0.7'],
    ['loc' => $siteUrl . '/contact/',        'lastmod' => $today, 'changefreq' => 'monthly', 'priority' => '0.6'],
    ['loc' => $siteUrl . '/news/',           'lastmod' => $today, 'changefreq' => 'weekly',  'priority' => '0.7'],
    ['loc' => $siteUrl . '/privacy-policy/', 'lastmod' => $today, 'changefreq' => 'yearly',  'priority' => '0.3'],
];

foreach (array_keys(ProductRepository::CATEGORIES) as $slug) {
    $urls[] = [
        'loc'        => $siteUrl . '/shop/?category=' . rawurlencode($slug),
        'lastmod'    => $today,
        'changefreq' => 'daily',
        'priority'   => '0.8',
    ];
}

// Product URLs: the canonical form the renderer emits, so the sitemap and the
// canonical tag always agree.
$productLastmod = ProductRepository::generatedAt();
$productLastmod = is_string($productLastmod) ? substr($productLastmod, 0, 10) : $today;
foreach (ProductRepository::all() as $product) {
    $urls[] = [
        'loc' => $siteUrl . '/shop/?category=' . rawurlencode((string) $product['category'])
            . '&product=' . rawurlencode((string) $product['id']),
        'lastmod'    => $productLastmod,
        'changefreq' => 'weekly',
        'priority'   => '0.8',
    ];
}

$articles = Database::all(
    "SELECT id, published_at, content_updated_at FROM news
     WHERE deleted_at IS NULL
       AND status IN ('published', 'scheduled')
       AND published_at IS NOT NULL
       AND published_at <= NOW()
     ORDER BY published_at DESC
     LIMIT 2000"
);
foreach ($articles as $article) {
    $modified = is_string($article['content_updated_at'] ?? null) && $article['content_updated_at'] !== ''
        ? (string) $article['content_updated_at']
        : (string) $article['published_at'];
    $urls[] = [
        'loc'        => $siteUrl . '/news/' . (int) $article['id'],
        'lastmod'    => substr(Seo::isoDate($modified), 0, 10) ?: $today,
        'changefreq' => 'monthly',
        'priority'   => '0.6',
    ];
}

$e = static fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
foreach ($urls as $url) {
    echo "  <url>\n";
    echo '    <loc>' . $e($url['loc']) . "</loc>\n";
    echo '    <lastmod>' . $e($url['lastmod']) . "</lastmod>\n";
    echo '    <changefreq>' . $e($url['changefreq']) . "</changefreq>\n";
    echo '    <priority>' . $e($url['priority']) . "</priority>\n";
    echo "  </url>\n";
}
echo '</urlset>' . "\n";
