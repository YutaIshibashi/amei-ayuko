<?php

declare(strict_types=1);

namespace Amei;

/**
 * Admin operation log: who did what, when, from where.
 *
 * Deliberately records only datetime / IP / action / target — no before-and-
 * after payloads, which would otherwise become a second copy of the content
 * (and, for contact settings, of personal data).
 */
final class AuditLog
{
    private const RETENTION_DAYS = 90;

    public const ACTIONS = [
        'login_success'    => 'ログイン成功',
        'login_failed'     => 'ログイン失敗',
        'logout'           => 'ログアウト',
        'news_create'      => 'お知らせ作成',
        'news_update'      => 'お知らせ更新',
        'news_delete'      => 'お知らせ削除',
        'news_restore'     => 'お知らせ復元',
        'news_publish'     => 'お知らせ公開',
        'news_unpublish'   => 'お知らせ非公開',
        'main_visual'      => 'メインビジュアル変更',
        'site_settings'    => 'サイト設定変更',
        'contact_settings' => 'お問い合わせ設定変更',
        'product_category' => '商品カテゴリ変更',
    ];

    public static function write(string $action, ?string $targetId = null): void
    {
        try {
            Database::run(
                'INSERT INTO admin_operation_logs (ip, action, target_id) VALUES (:ip, :a, :t)',
                [
                    ':ip' => mb_substr(Http::clientIp(), 0, 45),
                    ':a'  => mb_substr($action, 0, 64),
                    ':t'  => $targetId === null ? null : mb_substr($targetId, 0, 64),
                ]
            );
        } catch (\Throwable $e) {
            // An audit failure must not break the operation being audited.
            Logger::error(Logger::CHANNEL_ADMIN, 'Audit log write failed', ['action' => $action]);
            return;
        }

        if (random_int(1, 100) === 1) {
            Database::run(
                'DELETE FROM admin_operation_logs WHERE occurred_at < (NOW() - INTERVAL :d DAY)',
                [':d' => self::RETENTION_DAYS]
            );
        }
    }

    public static function label(string $action): string
    {
        return self::ACTIONS[$action] ?? $action;
    }
}
