<?php

declare(strict_types=1);

/**
 * POST /api/sync/commit.php
 *
 * Validates the staged run and, only if every check passes, swaps it into
 * production atomically. A rejected run leaves the previous catalogue exactly
 * as it was and answers 422 with the reasons, which GitHub Actions turns into
 * a failed workflow and a notification mail.
 *
 * Body: { "syncId": "...", "imageSuccess": n, "imageFailure": n, "mainImageFailure": n }
 */

require_once dirname(__DIR__, 3) . '/_app/bootstrap.php';
require_once __DIR__ . '/_auth.php';

use Amei\Database;
use Amei\Http;
use Amei\Mailer;
use Amei\SyncService;
use Amei\SyncValidationException;

use function Amei\blockDuringMaintenance;
use function Amei\requireSyncAuth;
use function Amei\syncId;

Http::requireMethod('POST');
requireSyncAuth();
blockDuringMaintenance();

$body = Http::jsonBody(64_000);
$id = syncId($body['syncId'] ?? null);

$stats = [
    'imageSuccess'     => max(0, (int) ($body['imageSuccess'] ?? 0)),
    'imageFailure'     => max(0, (int) ($body['imageFailure'] ?? 0)),
    'mainImageFailure' => max(0, (int) ($body['mainImageFailure'] ?? 0)),
];

try {
    $result = SyncService::commit($id, $stats);
} catch (SyncValidationException $e) {
    notifyFailure($id, $e->getMessage());
    Http::error('validation_failed', $e->getMessage(), 422);
} catch (\Throwable $e) {
    SyncService::fail($id, 'サーバー側の処理でエラーが発生しました', 'sync/commit: ' . $e->getMessage());
    notifyFailure($id, 'サーバー側の処理でエラーが発生しました');
    Http::error('commit_failed', 'Commit failed.', 500);
}

// The uncategorised list is rebuilt on every run; mail only what is new.
notifyUncategorized();

Http::json(['ok' => true] + $result, 200);

/** Administrator notification for a rejected or failed run. */
function notifyFailure(string $syncId, string $reason): void
{
    $previous = SyncService::lastSuccessAt() ?? '（記録なし）';
    $now = date('Y-m-d H:i:s');

    $text = implode("\n", [
        'minne同期が失敗しました。本番の商品データは更新されていません。',
        '',
        '発生日時：' . $now,
        '対象：minne商品同期（sync_id: ' . $syncId . '）',
        'HTTPステータス：422',
        'エラー概要：' . $reason,
        '前回成功日時：' . $previous,
        '',
        '直近の同期状況は管理画面「Shop Sync Status」からご確認いただけます。',
    ]);

    Mailer::notifyAdmin('【amei ayuko】minne同期に失敗しました', $text);
}

/** One-time notification for products the classifier could not place. */
function notifyUncategorized(): void
{
    $rows = Database::all(
        'SELECT product_id, name, url FROM uncategorized_products WHERE notified = 0'
    );
    if ($rows === []) {
        return;
    }

    $lines = array_map(
        static fn (array $r): string => '・' . $r['name'] . "\n  " . $r['url'],
        $rows
    );

    $text = "自動分類できなかった商品があります。\n"
        . "これらの商品は公開サイトには表示されません。\n"
        . "管理画面「Shop Sync Status」からカテゴリを設定してください。\n\n"
        . implode("\n", $lines);

    if (Mailer::notifyAdmin('【amei ayuko】未分類の商品があります', $text)) {
        Database::run('UPDATE uncategorized_products SET notified = 1 WHERE notified = 0');
    }
}
