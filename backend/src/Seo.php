<?php

declare(strict_types=1);

namespace Amei;

/**
 * Builds the crawler-facing head for URLs that a static export cannot know
 * about — product modals and news articles — and injects it into the exported
 * HTML shell.
 *
 * The visitor-facing UI is unchanged: the same Next.js document is served, and
 * the React app takes over as usual. Only the contents of <head> (plus a
 * <noscript> summary) differ, which is what search engines read.
 */
final class Seo
{
    /**
     * Replaces the head of an exported document.
     *
     * @param array{title: string, description: string, canonical: string,
     *              ogType?: string, ogImage?: string, ogImageAlt?: string,
     *              robots?: string, jsonLd?: list<array<string, mixed>>,
     *              noscript?: string} $meta
     */
    public static function inject(string $html, array $meta): string
    {
        $title = self::clean($meta['title']);
        $description = self::clean($meta['description'], 160);
        $canonical = $meta['canonical'];
        $ogType = $meta['ogType'] ?? 'website';
        $ogImage = $meta['ogImage'] ?? (Config::siteUrl() . '/brand/ogp-default.png');
        $ogImageAlt = self::clean($meta['ogImageAlt'] ?? $title, 120);
        $robots = $meta['robots'] ?? 'index, follow, max-image-preview:large';

        $e = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        // Drop the tags the export produced so there is exactly one of each.
        $html = self::stripTag($html, 'title');
        $html = self::stripMeta($html, ['description', 'robots']);
        $html = self::stripProperty($html, [
            'og:title', 'og:description', 'og:url', 'og:type', 'og:image',
            'og:image:alt', 'og:image:width', 'og:image:height',
        ]);
        $html = self::stripMeta($html, [
            'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
        ]);
        $html = self::stripLink($html, 'canonical');
        // The shell's own JSON-LD describes the shell, not this URL.
        $html = preg_replace('#<script type="application/ld\+json">.*?</script>#is', '', $html) ?? $html;

        $head = "\n<title>{$e($title)}</title>\n"
            . '<meta name="description" content="' . $e($description) . "\">\n"
            . '<meta name="robots" content="' . $e($robots) . "\">\n"
            . '<link rel="canonical" href="' . $e($canonical) . "\">\n"
            . '<meta property="og:type" content="' . $e($ogType) . "\">\n"
            . '<meta property="og:site_name" content="amei ayuko">' . "\n"
            . '<meta property="og:locale" content="ja_JP">' . "\n"
            . '<meta property="og:title" content="' . $e($title) . "\">\n"
            . '<meta property="og:description" content="' . $e($description) . "\">\n"
            . '<meta property="og:url" content="' . $e($canonical) . "\">\n"
            . '<meta property="og:image" content="' . $e($ogImage) . "\">\n"
            . '<meta property="og:image:alt" content="' . $e($ogImageAlt) . "\">\n"
            . '<meta name="twitter:card" content="summary_large_image">' . "\n"
            . '<meta name="twitter:title" content="' . $e($title) . "\">\n"
            . '<meta name="twitter:description" content="' . $e($description) . "\">\n"
            . '<meta name="twitter:image" content="' . $e($ogImage) . "\">\n";

        foreach ($meta['jsonLd'] ?? [] as $graph) {
            $json = json_encode($graph, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                continue;
            }
            // A literal `</script>` inside a string value would terminate the
            // block early, so `<` is emitted as its JSON unicode escape.
            $head .= '<script type="application/ld+json">'
                . str_replace('<', '\u003c', $json) . "</script>\n";
        }

        $html = self::insertBeforeHeadClose($html, $head);

        if (($meta['noscript'] ?? '') !== '') {
            // A text fallback for crawlers that do not execute the bundle, and
            // for visitors with JavaScript disabled.
            $html = str_ireplace(
                '<div id="__next_fallback"></div>',
                '',
                $html
            );
            $html = preg_replace(
                '#(<body[^>]*>)#i',
                '$1<noscript>' . $meta['noscript'] . '</noscript>',
                $html,
                1
            ) ?? $html;
        }

        return $html;
    }

    /**
     * Product structured data.
     *
     * `offers.url` points at minne, because that is where a purchase actually
     * happens — pointing it at this site would misrepresent the offer.
     *
     * @param array<string, mixed> $product
     * @return array<string, mixed>
     */
    public static function productJsonLd(array $product, string $canonical): array
    {
        $siteUrl = Config::siteUrl();
        $images = [];
        foreach ((array) ($product['images'] ?? []) as $image) {
            if (is_array($image) && isset($image['large'])) {
                $images[] = self::absolute((string) $image['large'], $siteUrl);
            }
        }

        return [
            '@context'    => 'https://schema.org',
            '@type'       => 'Product',
            'name'        => (string) $product['name'],
            'description' => self::clean((string) ($product['description'] ?? ''), 500),
            'image'       => $images,
            'sku'         => (string) $product['id'],
            'category'    => ProductRepository::categoryLabel((string) ($product['category'] ?? '')),
            'url'         => $canonical,
            'brand'       => ['@type' => 'Brand', 'name' => 'amei ayuko'],
            'offers'      => [
                '@type'         => 'Offer',
                'url'           => (string) $product['url'],
                'price'         => (string) ((int) $product['price']),
                'priceCurrency' => 'JPY',
                'availability'  => ($product['inStock'] ?? true)
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                'seller'        => ['@type' => 'Organization', 'name' => 'amei ayuko'],
            ],
        ];
    }

    /**
     * @param list<array{name: string, url: string}> $trail
     * @return array<string, mixed>
     */
    public static function breadcrumbJsonLd(array $trail): array
    {
        $items = [];
        foreach ($trail as $i => $crumb) {
            $items[] = [
                '@type'    => 'ListItem',
                'position' => $i + 1,
                'name'     => $crumb['name'],
                'item'     => $crumb['url'],
            ];
        }
        return [
            '@context'        => 'https://schema.org',
            '@type'           => 'BreadcrumbList',
            'itemListElement' => $items,
        ];
    }

    /**
     * @param array<string, mixed> $article
     * @return array<string, mixed>
     */
    public static function articleJsonLd(array $article, string $canonical): array
    {
        $siteUrl = Config::siteUrl();
        $published = self::isoDate((string) $article['published_at']);
        $modified = is_string($article['content_updated_at'] ?? null) && $article['content_updated_at'] !== ''
            ? self::isoDate((string) $article['content_updated_at'])
            : $published;

        $graph = [
            '@context'         => 'https://schema.org',
            '@type'            => 'NewsArticle',
            'headline'         => mb_substr((string) $article['title'], 0, 110),
            'description'      => Sanitizer::excerpt((string) $article['body'], 160),
            'datePublished'    => $published,
            'dateModified'     => $modified,
            'inLanguage'       => 'ja',
            'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $canonical],
            // Not shown in the UI, but search engines expect an author.
            'author'           => ['@type' => 'Person', 'name' => 'amei ayuko'],
            'publisher'        => [
                '@type' => 'Organization',
                'name'  => 'amei ayuko',
                'logo'  => ['@type' => 'ImageObject', 'url' => $siteUrl . '/brand/logo.svg'],
            ],
        ];

        if (is_string($article['image_path'] ?? null) && $article['image_path'] !== '') {
            $graph['image'] = [self::absolute((string) $article['image_path'], $siteUrl)];
        }

        return $graph;
    }

    public static function absolute(string $path, ?string $siteUrl = null): string
    {
        if (preg_match('#^https?://#i', $path) === 1) {
            return $path;
        }
        $siteUrl ??= Config::siteUrl();
        return $siteUrl . '/' . ltrim($path, '/');
    }

    /** MySQL DATETIME (JST) → ISO 8601 with offset. */
    public static function isoDate(string $mysqlDateTime): string
    {
        try {
            return (new \DateTimeImmutable($mysqlDateTime, new \DateTimeZone('Asia/Tokyo')))
                ->format(DATE_ATOM);
        } catch (\Exception) {
            return '';
        }
    }

    /** Collapses whitespace and truncates, for a title or description. */
    public static function clean(string $value, int $max = 0): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', strip_tags($value)) ?? '');
        if ($max > 0 && mb_strlen($value) > $max) {
            $value = mb_substr($value, 0, $max - 1) . '…';
        }
        return $value;
    }

    /* ------------------------------------------------------------- rewriting */

    private static function stripTag(string $html, string $tag): string
    {
        return preg_replace("#<{$tag}[^>]*>.*?</{$tag}>#is", '', $html, 1) ?? $html;
    }

    /** @param list<string> $names */
    private static function stripMeta(string $html, array $names): string
    {
        foreach ($names as $name) {
            $quoted = preg_quote($name, '#');
            $html = preg_replace("#<meta[^>]+name=[\"']{$quoted}[\"'][^>]*>#i", '', $html) ?? $html;
        }
        return $html;
    }

    /** @param list<string> $properties */
    private static function stripProperty(string $html, array $properties): string
    {
        foreach ($properties as $property) {
            $quoted = preg_quote($property, '#');
            $html = preg_replace("#<meta[^>]+property=[\"']{$quoted}[\"'][^>]*>#i", '', $html) ?? $html;
        }
        return $html;
    }

    private static function stripLink(string $html, string $rel): string
    {
        $quoted = preg_quote($rel, '#');
        return preg_replace("#<link[^>]+rel=[\"']{$quoted}[\"'][^>]*>#i", '', $html) ?? $html;
    }

    private static function insertBeforeHeadClose(string $html, string $fragment): string
    {
        $pos = stripos($html, '</head>');
        if ($pos === false) {
            return $fragment . $html;
        }
        return substr($html, 0, $pos) . $fragment . substr($html, $pos);
    }
}
