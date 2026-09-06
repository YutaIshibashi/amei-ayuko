<?php

declare(strict_types=1);

/** Admin dashboard: the state of the site at a glance. */

require_once dirname(__DIR__) . '/_app/bootstrap.php';
require_once __DIR__ . '/_layout.php';

use Amei\AuditLog;
use Amei\Auth;
use Amei\Database;
use Amei\Maintenance;
use Amei\NewsRepository;
use Amei\ProductRepository;
use Amei\Sanitizer;
use Amei\SyncService;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);

$publishedCount = (int) Database::value(
    "SELECT COUNT(*) FROM news
     WHERE deleted_at IS NULL AND status IN ('published','scheduled')
       AND published_at IS NOT NULL AND published_at <= NOW()"
);
$draftCount = (int) Database::value(
    "SELECT COUNT(*) FROM news WHERE deleted_at IS NULL AND status = 'draft'"
);
$scheduledCount = (int) Database::value(
    "SELECT COUNT(*) FROM news
     WHERE deleted_at IS NULL AND status = 'scheduled' AND published_at > NOW()"
);

$products = ProductRepository::all();
$productCount = count($products);
$uncategorized = Database::all('SELECT product_id, name, url FROM uncategorized_products ORDER BY detected_at DESC');
$lastSync = Database::one('SELECT * FROM sync_sessions ORDER BY started_at DESC LIMIT 1');
$brokenRelations = NewsRepository::withMissingRelatedProduct();
$recentLogs = Database::all(
    'SELECT occurred_at, ip, action, target_id FROM admin_operation_logs ORDER BY occurred_at DESC LIMIT 12'
);

adminHead('ダッシュボード');
?>

<?php if ($uncategorized !== []): ?>
  <p class="banner banner--warn">
    自動分類できなかった商品が <strong><?= count($uncategorized) ?>件</strong> あります。
    公開サイトには表示されていません。
    <a href="/admin/sync.php#uncategorized">カテゴリを設定する</a>
  </p>
<?php endif; ?>

<?php if ($brokenRelations !== []): ?>
  <p class="banner banner--warn">
    関連商品がminneから削除されたお知らせが <strong><?= count($brokenRelations) ?>件</strong> あります。
    記事は公開されたままで、商品CTAのみ非表示になっています。
    <a href="#broken-relations">確認する</a>
  </p>
<?php endif; ?>

<section class="panel">
  <h2 class="panel__title">サイトの状態</h2>
  <div class="stats">
    <div class="stat">
      <p class="stat__label">公開中のお知らせ</p>
      <p class="stat__value"><?= $publishedCount ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">下書き</p>
      <p class="stat__value"><?= $draftCount ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">予約公開</p>
      <p class="stat__value"><?= $scheduledCount ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">掲載中の商品</p>
      <p class="stat__value"><?= $productCount ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">未分類の商品</p>
      <p class="stat__value"><?= count($uncategorized) ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">メンテナンスモード</p>
      <p class="stat__value"><?= Maintenance::isActive() ? 'ON' : 'OFF' ?></p>
    </div>
  </div>
</section>

<section class="panel">
  <h2 class="panel__title">最新のminne同期</h2>
  <?php if ($lastSync === null): ?>
    <p class="empty">まだ同期の記録がありません。</p>
  <?php else: ?>
    <div class="stats">
      <div class="stat">
        <p class="stat__label">結果</p>
        <p class="stat__value">
          <span class="badge badge--<?= $e((string) $lastSync['status']) ?>"><?= $e((string) $lastSync['status']) ?></span>
        </p>
      </div>
      <div class="stat">
        <p class="stat__label">開始日時</p>
        <p class="stat__value" style="font-size:15px"><?= $e((string) $lastSync['started_at']) ?></p>
      </div>
      <div class="stat">
        <p class="stat__label">商品総数</p>
        <p class="stat__value"><?= (int) $lastSync['total_products'] ?></p>
      </div>
      <div class="stat">
        <p class="stat__label">前回成功日時</p>
        <p class="stat__value" style="font-size:15px"><?= $e(SyncService::lastSuccessAt() ?? '—') ?></p>
      </div>
    </div>
    <?php if (($lastSync['error_summary'] ?? '') !== ''): ?>
      <p class="banner banner--error" style="margin-top:16px">
        エラー概要：<?= $e((string) $lastSync['error_summary']) ?>
      </p>
    <?php endif; ?>
    <p style="margin-top:14px"><a class="btn btn--ghost btn--sm" href="/admin/sync.php">同期履歴を見る</a></p>
  <?php endif; ?>
</section>

<?php if ($brokenRelations !== []): ?>
<section class="panel" id="broken-relations">
  <h2 class="panel__title">関連商品が見つからないお知らせ</h2>
  <p class="panel__note">
    minneから削除された商品を参照しています。記事は公開されたままです。
    別の商品に差し替えるか、関連商品の設定を外してください（自動では変更しません）。
  </p>
  <div class="table-scroll">
    <table class="table">
      <thead><tr><th>ID</th><th>タイトル</th><th>参照中の商品ID</th><th></th></tr></thead>
      <tbody>
      <?php foreach ($brokenRelations as $row): ?>
        <tr>
          <td class="num"><?= (int) $row['id'] ?></td>
          <td><?= $e((string) $row['title']) ?></td>
          <td class="mono"><?= $e((string) $row['related_product_id']) ?></td>
          <td><a class="btn btn--ghost btn--sm" href="/admin/news/edit.php?id=<?= (int) $row['id'] ?>">編集</a></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
</section>
<?php endif; ?>

<section class="panel">
  <h2 class="panel__title">最近の操作ログ</h2>
  <div class="table-scroll">
    <table class="table">
      <thead><tr><th>日時</th><th>操作</th><th>対象</th><th>IP</th></tr></thead>
      <tbody>
      <?php if ($recentLogs === []): ?>
        <tr><td colspan="4" class="empty">記録がありません。</td></tr>
      <?php endif; ?>
      <?php foreach ($recentLogs as $log): ?>
        <tr>
          <td class="nowrap mono"><?= $e((string) $log['occurred_at']) ?></td>
          <td><?= $e(AuditLog::label((string) $log['action'])) ?></td>
          <td class="mono"><?= $e((string) ($log['target_id'] ?? '')) ?></td>
          <td class="mono muted"><?= $e((string) $log['ip']) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <p class="panel__note" style="margin:12px 0 0">操作ログは90日間保持されます。</p>
</section>

<?php
adminFoot();
