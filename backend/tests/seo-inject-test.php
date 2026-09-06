#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * Integration check for the dynamic-SEO renderer.
 *
 *   php backend/tests/seo-inject-test.php
 *
 * This guards the most fragile seam in the whole system: PHP rewriting the
 * <head> of HTML that Next.js produced. A Next.js upgrade can change how that
 * head is emitted, and the failure mode is silent — the page still renders,
 * but search engines see the wrong title, a duplicate canonical, or no
 * structured data at all. So the check runs against the *real* export, not a
 * fixture, and CI fails if the two ever stop fitting together.
 *
 * Requires `frontend/out/` to exist (run `npm run build` in frontend/ first).
 */

$root = dirname(__DIR__, 2);
putenv('AMEI_APP_DIR=' . $root . '/backend');
putenv('AMEI_WEB_ROOT=' . $root . '/frontend/out');
putenv('SITE_URL=https://amei-ayuko.jp');

require $root . '/backend/bootstrap.php';

use Amei\Seo;

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only.\n");
    exit(1);
}

$out = $root . '/frontend/out';
if (!is_dir($out)) {
    fwrite(STDERR, "frontend/out not found — run `npm run build` in frontend/ first.\n");
    exit(1);
}

/** @var list<array{label: string, ok: bool}> $results */
$results = [];

function check(string $label, bool $ok): void
{
    global $results;
    $results[] = ['label' => $label, 'ok' => $ok];
}

/* ---------------------------------------------------------------- product */

$shopShell = (string) file_get_contents($out . '/shop/index.html');

$product = [
    'id'          => '1001',
    'name'        => 'アルバムフレーク はじめての1年',
    'description' => "月齢カードとメッセージ枠のセット。\n鉛筆でも書き込めます。",
    'price'       => 880,
    'category'    => 'album-flake',
    'url'         => 'https://minne.com/items/1001',
    'inStock'     => true,
    'images'      => [
        ['thumb' => '/products/1001/00-thumb.webp', 'large' => '/products/1001/00-large.webp'],
        ['thumb' => '/products/1001/01-thumb.webp', 'large' => '/products/1001/01-large.webp'],
    ],
];
$productCanonical = 'https://amei-ayuko.jp/shop/?category=album-flake&product=1001';

$productHtml = Seo::inject($shopShell, [
    'title'       => 'アルバムフレーク はじめての1年｜アルバムフレーク | amei ayuko',
    'description' => '手描きのアルバムフレーク。育児アルバムや成長記録づくりに。',
    'canonical'   => $productCanonical,
    'ogType'      => 'product',
    'ogImage'     => 'https://amei-ayuko.jp/products/1001/00-large.webp',
    'noscript'    => '<article><h1>アルバムフレーク はじめての1年</h1></article>',
    'jsonLd'      => [
        Seo::productJsonLd($product, $productCanonical),
        Seo::breadcrumbJsonLd([
            ['name' => 'ホーム', 'url' => 'https://amei-ayuko.jp/'],
            ['name' => 'オンラインショップ', 'url' => 'https://amei-ayuko.jp/shop/'],
            ['name' => 'アルバムフレーク', 'url' => 'https://amei-ayuko.jp/shop/?category=album-flake'],
        ]),
    ],
]);

// Exactly one of each: a leftover from the export would compete with ours.
check('product: single <title>', substr_count($productHtml, '<title>') === 1);
check('product: single description meta', substr_count($productHtml, 'name="description"') === 1);
check('product: single canonical', substr_count($productHtml, 'rel="canonical"') === 1);
check('product: single og:title', substr_count($productHtml, 'property="og:title"') === 1);
check('product: single og:image', substr_count($productHtml, 'property="og:image"') === 1);

check('product: title is the product', str_contains($productHtml, '<title>アルバムフレーク はじめての1年｜'));
check('product: canonical is the product URL', str_contains(
    $productHtml,
    'href="https://amei-ayuko.jp/shop/?category=album-flake&amp;product=1001"',
));
check('product: og:type is product', str_contains($productHtml, '<meta property="og:type" content="product">'));
check('product: twitter card', str_contains($productHtml, 'name="twitter:card" content="summary_large_image"'));

// Product structured data — the fields the brief requires, by name.
check('product: Product JSON-LD', str_contains($productHtml, '"@type":"Product"'));
check('product: name', str_contains($productHtml, '"name":"アルバムフレーク はじめての1年"'));
check('product: image list', str_contains($productHtml, '/products/1001/00-large.webp'));
check('product: price', str_contains($productHtml, '"price":"880"'));
check('product: priceCurrency JPY', str_contains($productHtml, '"priceCurrency":"JPY"'));
check('product: availability', str_contains($productHtml, 'schema.org/InStock'));
check('product: brand is amei ayuko', str_contains($productHtml, '"brand":{"@type":"Brand","name":"amei ayuko"}'));
check('product: offer URL is minne', str_contains($productHtml, '"url":"https://minne.com/items/1001"'));
check('product: BreadcrumbList', str_contains($productHtml, '"@type":"BreadcrumbList"'));

// A literal `</script>` inside a JSON string would end the block early.
check('product: JSON-LD contains no raw <', preg_match(
    '#<script type="application/ld\+json">[^<]*<(?!/script)#',
    $productHtml,
) === 0);

check('product: noscript fallback', str_contains($productHtml, '<noscript><article>'));
// The whole point is that the visitor still gets the React app.
check('product: app bundle survives', str_contains($productHtml, '/_next/static/'));
check('product: document still closes its head', str_contains($productHtml, '</head>'));

/* ------------------------------------------------------------------- news */

$newsShell = (string) file_get_contents($out . '/news/detail/index.html');

$article = [
    'id'                 => 123,
    'title'              => '新作のアルバムフレークができました',
    'body'               => '<p>新しいアルバムフレークができました。</p><h2>使い方</h2><p>貼るだけです。</p>',
    'category'           => 'new-product',
    'published_at'       => '2026-08-01 10:00:00',
    'content_updated_at' => '2026-08-05 12:30:00',
    'image_path'         => '/uploads/news/20260801-abc.webp',
];
$newsCanonical = 'https://amei-ayuko.jp/news/123';

$newsHtml = Seo::inject($newsShell, [
    'title'       => '新作のアルバムフレークができました | amei ayuko',
    'description' => '新しいアルバムフレークができました。',
    'canonical'   => $newsCanonical,
    'ogType'      => 'article',
    'ogImage'     => 'https://amei-ayuko.jp/uploads/news/20260801-abc.webp',
    'jsonLd'      => [
        Seo::articleJsonLd($article, $newsCanonical),
        Seo::breadcrumbJsonLd([
            ['name' => 'ホーム',   'url' => 'https://amei-ayuko.jp/'],
            ['name' => 'お知らせ', 'url' => 'https://amei-ayuko.jp/news/'],
            ['name' => '新作のアルバムフレークができました', 'url' => $newsCanonical],
        ]),
    ],
]);

check('news: single <title>', substr_count($newsHtml, '<title>') === 1);
check('news: canonical is /news/123', str_contains($newsHtml, 'href="https://amei-ayuko.jp/news/123"'));
check('news: og:type is article', str_contains($newsHtml, '<meta property="og:type" content="article">'));
check('news: NewsArticle JSON-LD', str_contains($newsHtml, '"@type":"NewsArticle"'));
check('news: author is amei ayuko', str_contains($newsHtml, '"author":{"@type":"Person","name":"amei ayuko"}'));
check('news: datePublished in JST', str_contains($newsHtml, '"datePublished":"2026-08-01T10:00:00+09:00"'));
// dateModified only differs once the article has actually been edited.
check('news: dateModified reflects the edit', str_contains($newsHtml, '"dateModified":"2026-08-05T12:30:00+09:00"'));
check('news: BreadcrumbList', str_contains($newsHtml, '"@type":"BreadcrumbList"'));

// An article that was never edited must report the two dates identically.
$unedited = $article;
$unedited['content_updated_at'] = null;
$uneditedGraph = Seo::articleJsonLd($unedited, $newsCanonical);
check(
    'news: an unedited article has dateModified == datePublished',
    $uneditedGraph['dateModified'] === $uneditedGraph['datePublished'],
);

/* ----------------------------------------------------------------- report */

$failed = 0;
foreach ($results as $result) {
    if (!$result['ok']) {
        $failed++;
    }
    printf("%-5s %s\n", $result['ok'] ? 'ok' : 'FAIL', $result['label']);
}

printf("\n%d checks, %d failed\n", count($results), $failed);
exit($failed === 0 ? 0 : 1);
