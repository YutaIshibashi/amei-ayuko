<?php

declare(strict_types=1);

namespace Amei;

use HTMLPurifier;
use HTMLPurifier_Config;

/**
 * HTML sanitisation for news bodies.
 *
 * The editor only offers headings, bold, links, lists, line breaks and quotes,
 * and this allow-list is what actually enforces that — the sanitised result is
 * what gets stored, so a bypass in the editor cannot put script into the
 * database. HTMLPurifier is used rather than a hand-rolled regex because
 * "strip the dangerous parts of HTML" is exactly the problem it exists for.
 */
final class Sanitizer
{
    private static ?HTMLPurifier $purifier = null;

    public static function html(string $dirty): string
    {
        if ($dirty === '') {
            return '';
        }
        return self::purifier()->purify($dirty);
    }

    /** Plain-text excerpt for list views and meta descriptions. */
    public static function excerpt(string $html, int $length = 120): string
    {
        $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
        return mb_strlen($text) <= $length ? $text : mb_substr($text, 0, $length - 1) . '…';
    }

    /** Escapes a value for HTML output. Used by every admin template. */
    public static function e(?string $value): string
    {
        return htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private static function purifier(): HTMLPurifier
    {
        if (self::$purifier instanceof HTMLPurifier) {
            return self::$purifier;
        }

        $cacheDir = STORAGE_DIR . '/cache/htmlpurifier';
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0750, true);
        }

        $config = HTMLPurifier_Config::createDefault();
        $config->set('Core.Encoding', 'UTF-8');
        $config->set('HTML.Doctype', 'HTML 4.01 Transitional');
        $config->set('HTML.Allowed', implode(',', [
            'p', 'br', 'strong', 'em',
            'h2', 'h3',
            'ul', 'ol', 'li',
            'blockquote',
            'a[href|title|target|rel]',
        ]));
        // Only http(s) and mailto links survive — no javascript:, no data:.
        $config->set('URI.AllowedSchemes', ['http' => true, 'https' => true, 'mailto' => true]);
        $config->set('AutoFormat.RemoveEmpty', true);
        $config->set('AutoFormat.AutoParagraph', false);
        // Any link that opens a new tab gets noopener/noreferrer added for it.
        $config->set('HTML.TargetBlank', false);
        $config->set('HTML.Nofollow', false);
        $config->set('Attr.AllowedRel', ['noopener', 'noreferrer', 'nofollow']);
        if (is_dir($cacheDir) && is_writable($cacheDir)) {
            $config->set('Cache.SerializerPath', $cacheDir);
        } else {
            $config->set('Cache.DefinitionImpl', null);
        }

        self::$purifier = new HTMLPurifier($config);
        return self::$purifier;
    }
}
