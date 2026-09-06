<?php

declare(strict_types=1);

namespace Amei;

/**
 * Editable site settings.
 *
 * A flat key/value table with a fixed, code-owned key list: the admin screen
 * can change values but never invent keys, so a typo in the UI cannot silently
 * create a setting nothing reads.
 */
final class Settings
{
    /** key => [label, type] where type is text|textarea|url|image */
    public const KEYS = [
        'site_title'                  => ['サイトタイトル', 'text'],
        'meta_description'            => ['メタディスクリプション', 'textarea'],
        'ogp_image'                   => ['共通OGP画像', 'image'],
        'ga4_measurement_id'          => ['GA4 測定ID', 'text'],
        'search_console_verification' => ['Search Console 確認コード', 'text'],
        'instagram_url'               => ['Instagram URL', 'url'],
        'minne_url'                   => ['minne URL', 'url'],
        'creema_url'                  => ['Creema URL', 'url'],
        'mercari_url'                 => ['メルカリ URL', 'url'],
        'inframe_url'                 => ['INFRAME URL', 'url'],
        'base_url'                    => ['BASE URL', 'url'],
        'rakuma_url'                  => ['ラクマ URL', 'url'],
        'copyright'                   => ['コピーライト', 'text'],
        'brand_concept'               => ['ブランドコンセプト（短文）', 'textarea'],
        'about_intro'                 => ['About 紹介文', 'textarea'],
        'contact_intro'               => ['Contact 紹介文', 'textarea'],
        'footer_copy'                 => ['フッターコピー', 'text'],
    ];

    /** Contact settings are edited on their own screen. */
    public const CONTACT_KEYS = [
        'contact_admin_email'     => ['管理者通知メールアドレス', 'text'],
        'contact_reply_from_name' => ['自動返信の送信者名', 'text'],
        'contact_reply_subject'   => ['自動返信の件名', 'text'],
        'contact_reply_body'      => ['自動返信の本文（冒頭あいさつ）', 'textarea'],
    ];

    /** @var array<string, string>|null */
    private static ?array $cache = null;

    /** @return array<string, string> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $rows = Database::all('SELECT setting_key, setting_value FROM site_settings');
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['setting_key']] = (string) $row['setting_value'];
        }
        self::$cache = $out;
        return $out;
    }

    public static function get(string $key, string $default = ''): string
    {
        $all = self::all();
        $value = $all[$key] ?? '';
        return $value === '' ? $default : $value;
    }

    /** @param array<string, string> $values */
    public static function saveMany(array $values): void
    {
        $allowed = array_merge(array_keys(self::KEYS), array_keys(self::CONTACT_KEYS));

        Database::transaction(static function () use ($values, $allowed): void {
            $sql = 'INSERT INTO site_settings (setting_key, setting_value) VALUES (:k, :v)
                    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)';
            foreach ($values as $key => $value) {
                if (!in_array($key, $allowed, true)) {
                    continue; // unknown keys are dropped, not created
                }
                Database::run($sql, [':k' => $key, ':v' => $value]);
            }
        });

        self::$cache = null;
    }

    /**
     * Public payload consumed by the frontend (`/api/settings.php`).
     * Only values that are safe to expose publicly appear here.
     *
     * @return array<string, string|null>
     */
    public static function publicPayload(): array
    {
        $s = self::all();
        $current = Database::one(
            'SELECT image_path FROM main_visuals WHERE is_current = 1 ORDER BY uploaded_at DESC LIMIT 1'
        );

        return [
            'siteTitle'                 => $s['site_title'] ?? 'amei ayuko',
            'metaDescription'           => $s['meta_description'] ?? '',
            'ogpImage'                  => $s['ogp_image'] ?? '/brand/ogp-default.png',
            'ga4MeasurementId'          => $s['ga4_measurement_id'] ?? '',
            'searchConsoleVerification' => $s['search_console_verification'] ?? '',
            'instagramUrl'              => $s['instagram_url'] ?? '',
            'minneUrl'                  => $s['minne_url'] ?? '',
            'creemaUrl'                 => $s['creema_url'] ?? '',
            'mercariUrl'                => $s['mercari_url'] ?? '',
            'inframeUrl'                => $s['inframe_url'] ?? '',
            'baseUrl'                   => $s['base_url'] ?? '',
            'rakumaUrl'                 => $s['rakuma_url'] ?? '',
            'copyright'                 => $s['copyright'] ?? '© amei ayuko',
            'brandConcept'              => $s['brand_concept'] ?? '',
            'aboutIntro'                => $s['about_intro'] ?? '',
            'contactIntro'              => $s['contact_intro'] ?? '',
            'footerCopy'                => $s['footer_copy'] ?? '',
            'mainVisual'                => $current === null ? null : (string) $current['image_path'],
        ];
    }
}
