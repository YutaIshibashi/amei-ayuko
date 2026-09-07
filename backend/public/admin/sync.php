<?php

declare(strict_types=1);

/**
 * Shop sync status.
 *
 * Shows the run history (kept 90 days) and, more usefully day to day, the
 * products the classifier could not place — those are invisible on the public
 * site until someone assigns a category here.
 *
 * Raw sync logs are deliberately not surfaced: they belong in the application
 * log, not in an operations screen.
 */

require_once dirname(__DIR__) . '/_app/bootstrap.php';
require_once __DIR__ . '/_layout.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\Database;
use Amei\PendingProducts;
use Amei\ProductRepository;
use Amei\Sanitizer;
use Amei\Session;
use Amei\SyncService;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;
use function Amei\Admin\adminPager;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();
    $action = (string) ($_POST['action'] ?? '');
    $productId = trim((string) ($_POST['product_id'] ?? ''));

    if ($action === 'set_category' && $productId !== '') {
        $category = (string) ($_POST['category'] ?? '');
        if (!isset(ProductRepository::CATEGORIES[$category])) {
            Session::flash('カテゴリの指定が正しくありません。', 'error');
        } else {
            try {
                $wasPending = ProductRepository::find($productId) === null;
                ProductRepository::setOverride($productId, $category);
                Session::flash(
                    $wasPending
                        ? 'カテゴリを設定し、オンラインショップへ公開しました。以降の同期でもこの設定が優先されます。'
                        : 'カテゴリを変更しました。以降の同期でもこの設定が優先されます。'
                );
            } catch (\Throwable $e) {
                // The catalogue is swapped atomically, so a failure here leaves
                // the shop exactly as it was and the product still pending.
                Session::flash(
                    '公開に失敗しました。商品データは変更されていません。時間をおいて再度お試しください。',
                    'error'
                );
            }
        }
    }

    if ($action === 'clear_override' && $productId !== '') {
        try {
            $stillPublished = ProductRepository::find($productId) !== null;
            ProductRepository::clearOverride($productId);
            $nowPublished = ProductRepository::find($productId) !== null;

            Session::flash(
                match (true) {
                    !$stillPublished => '手動設定を解除しました。',
                    $nowPublished    => '手動設定を解除しました。自動分類でも同じ判定になったため、公開は継続しています。',
                    default          => '手動設定を解除しました。自動分類できなかったため、公開を停止し「自動分類できなかった商品」へ戻しました。',
                }
            );
        } catch (\Throwable $e) {
            Session::flash('解除に失敗しました。時間をおいて再度お試しください。', 'error');
        }
    }

    header('Location: /admin/sync.php');
    exit;
}

$page = max(1, (int) ($_GET['page'] ?? 1));
$perPage = 20;
$total = (int) Database::value('SELECT COUNT(*) FROM sync_sessions');
$totalPages = max(1, (int) ceil($total / $perPage));

$sessions = Database::all(
    'SELECT * FROM sync_sessions ORDER BY started_at DESC LIMIT :limit OFFSET :offset',
    [':limit' => $perPage, ':offset' => ($page - 1) * $perPage]
);

$uncategorized = Database::all('SELECT * FROM uncategorized_products ORDER BY detected_at DESC');
$overrides = Database::all(
    'SELECT o.product_id, o.category, o.updated_at FROM product_category_overrides o ORDER BY o.updated_at DESC'
);
$products = ProductRepository::all();
$productNames = [];
foreach (PendingProducts::all() as $pending) {
    $productNames[(string) $pending['id']] = (string) $pending['name'];
}
foreach ($products as $product) {
    $productNames[(string) $product['id']] = (string) $product['name'];
}

adminHead('Shop Sync Status');
?>

<section class="panel">
  <h2 class="panel__title">概要</h2>
  <div class="stats">
    <div class="stat">
      <p class="stat__label">掲載中の商品</p>
      <p class="stat__value"><?= count($products) ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">未分類</p>
      <p class="stat__value"><?= count($uncategorized) ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">手動カテゴリ設定</p>
      <p class="stat__value"><?= count($overrides) ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">前回成功日時</p>
      <p class="stat__value" style="font-size:15px"><?= $e(SyncService::lastSuccessAt() ?? '—') ?></p>
    </div>
    <div class="stat">
      <p class="stat__label">データ生成日時</p>
      <p class="stat__value" style="font-size:15px"><?= $e(ProductRepository::generatedAt() ?? '—') ?></p>
    </div>
  </div>
  <p class="panel__note" style="margin:14px 0 0">
    同期は毎日0:00（JST）に自動実行されます。手動で実行したい場合は、GitHubのActionsから
    「minne sync」ワークフローを <code>Run workflow</code> で起動してください。
  </p>
</section>

<section class="panel" id="uncategorized">
  <h2 class="panel__title">自動分類できなかった商品</h2>
  <p class="panel__note">
    これらの商品は<strong>公開サイトには表示されていません</strong>。
    カテゴリを設定した商品だけが、その場でオンラインショップへ公開されます
    （次回の同期を待つ必要はありません）。
    設定しなかった商品はこの一覧に残り、公開されません。
    設定した内容は、以降の同期でも優先されます。
  </p>

  <?php if ($uncategorized === []): ?>
    <p class="empty">未分類の商品はありません。</p>
  <?php else: ?>
    <div class="table-scroll">
      <table class="table">
        <thead><tr><th>商品ID</th><th>商品名</th><th>minne</th><th>カテゴリを設定</th></tr></thead>
        <tbody>
        <?php foreach ($uncategorized as $row): ?>
          <tr>
            <td class="mono"><?= $e((string) $row['product_id']) ?></td>
            <td><?= $e((string) $row['name']) ?></td>
            <td>
              <?php if (($row['url'] ?? '') !== ''): ?>
                <a href="<?= $e((string) $row['url']) ?>" target="_blank" rel="noopener noreferrer">商品ページ</a>
              <?php endif; ?>
            </td>
            <td>
              <form method="post" action="/admin/sync.php" class="row row--tight">
                <?= Csrf::field() ?>
                <input type="hidden" name="action" value="set_category">
                <input type="hidden" name="product_id" value="<?= $e((string) $row['product_id']) ?>">
                <select class="select" name="category" aria-label="カテゴリ">
                  <?php foreach (ProductRepository::CATEGORIES as $slug => $label): ?>
                    <option value="<?= $e($slug) ?>"><?= $e($label) ?></option>
                  <?php endforeach; ?>
                </select>
                <button class="btn btn--sm" type="submit">設定する</button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>

<section class="panel">
  <h2 class="panel__title">手動で設定したカテゴリ</h2>
  <p class="panel__note">
    自動分類より優先されます。解除すると、その場で自動分類をやり直します。
    自動でも同じ判定になる商品は公開が続き、判定できない商品は公開を停止して
    「自動分類できなかった商品」へ戻ります。
  </p>
  <?php if ($overrides === []): ?>
    <p class="empty">手動設定はありません。</p>
  <?php else: ?>
    <div class="table-scroll">
      <table class="table">
        <thead><tr><th>商品ID</th><th>商品名</th><th>カテゴリ</th><th>設定日時</th><th></th></tr></thead>
        <tbody>
        <?php foreach ($overrides as $row): $pid = (string) $row['product_id']; ?>
          <tr>
            <td class="mono"><?= $e($pid) ?></td>
            <td><?= $e($productNames[$pid] ?? '（現在の一覧にありません）') ?></td>
            <td><?= $e(ProductRepository::categoryLabel((string) $row['category'])) ?></td>
            <td class="nowrap mono"><?= $e((string) $row['updated_at']) ?></td>
            <td>
              <form method="post" action="/admin/sync.php">
                <?= Csrf::field() ?>
                <input type="hidden" name="action" value="clear_override">
                <input type="hidden" name="product_id" value="<?= $e($pid) ?>">
                <button class="btn btn--ghost btn--sm" type="submit"
                        data-confirm="手動設定を解除し、その場で自動分類をやり直します。自動分類できない商品は公開が停止されます。よろしいですか？">
                  解除
                </button>
              </form>
            </td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  <?php endif; ?>
</section>

<section class="panel">
  <h2 class="panel__title">同期履歴（90日間）</h2>
  <div class="table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th>sync_id</th><th>開始</th><th>終了</th><th>結果</th>
          <th>商品総数</th><th>Album&nbsp;Flake</th><th>Stamp</th>
          <th>追加</th><th>削除</th><th>画像成功</th><th>画像失敗</th>
          <th>HTTP</th><th>エラー概要</th><th>前回成功</th>
        </tr>
      </thead>
      <tbody>
      <?php if ($sessions === []): ?>
        <tr><td colspan="14" class="empty">同期の記録がありません。</td></tr>
      <?php endif; ?>
      <?php foreach ($sessions as $row): ?>
        <tr>
          <td class="mono"><?= $e(substr((string) $row['sync_id'], 0, 8)) ?></td>
          <td class="nowrap mono"><?= $e((string) $row['started_at']) ?></td>
          <td class="nowrap mono"><?= $e((string) ($row['finished_at'] ?? '—')) ?></td>
          <td><span class="badge badge--<?= $e((string) $row['status']) ?>"><?= $e((string) $row['status']) ?></span></td>
          <td class="num"><?= (int) $row['total_products'] ?></td>
          <td class="num"><?= (int) $row['album_flake_count'] ?></td>
          <td class="num"><?= (int) $row['stamp_count'] ?></td>
          <td class="num"><?= (int) $row['added_count'] ?></td>
          <td class="num"><?= (int) $row['removed_count'] ?></td>
          <td class="num"><?= (int) $row['image_success_count'] ?></td>
          <td class="num"><?= (int) $row['image_failure_count'] ?></td>
          <td class="num"><?= $e((string) ($row['http_status'] ?? '—')) ?></td>
          <td><?= $e((string) ($row['error_summary'] ?? '')) ?></td>
          <td class="nowrap mono"><?= $e((string) ($row['previous_success_at'] ?? '—')) ?></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php adminPager($page, $totalPages, ''); ?>
</section>

<?php
adminFoot();
