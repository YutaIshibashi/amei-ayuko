<?php

declare(strict_types=1);

/**
 * Deleted news.
 *
 * Deletion is a soft delete (`deleted_at`), so anything removed by mistake can
 * be brought straight back. Permanent deletion has no UI in this release — the
 * rows are small and losing an article for good is worse than keeping it.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\NewsRepository;
use Amei\Sanitizer;
use Amei\Session;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;
use function Amei\Admin\adminPager;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();
    $id = (int) ($_POST['id'] ?? 0);
    if ($id > 0 && ($_POST['action'] ?? '') === 'restore') {
        // Restoring is not destructive, so it needs no confirmation.
        NewsRepository::restore($id);
        Session::flash('記事を復元しました。');
    }
    header('Location: /admin/news/deleted.php');
    exit;
}

$page = max(1, (int) ($_GET['page'] ?? 1));
$result = NewsRepository::adminList($page, '', '', '', true);
$totalPages = max(1, (int) ceil($result['total'] / NewsRepository::PER_PAGE));

adminHead('削除済みのお知らせ');
?>

<p><a class="btn btn--ghost" href="/admin/news/">お知らせ一覧へ戻る</a></p>

<section class="panel">
  <p class="panel__note"><?= (int) $result['total'] ?>件</p>
  <div class="table-scroll">
    <table class="table">
      <thead><tr><th>ID</th><th>タイトル</th><th>カテゴリ</th><th>削除日時</th><th>操作</th></tr></thead>
      <tbody>
      <?php if ($result['items'] === []): ?>
        <tr><td colspan="5" class="empty">削除済みの記事はありません。</td></tr>
      <?php endif; ?>
      <?php foreach ($result['items'] as $row): ?>
        <tr>
          <td class="num"><?= (int) $row['id'] ?></td>
          <td><?= ((string) $row['title']) === '' ? '<span class="muted">（無題）</span>' : $e((string) $row['title']) ?></td>
          <td class="nowrap"><?= $e(NewsRepository::categoryLabel((string) $row['category'])) ?></td>
          <td class="nowrap mono"><?= $e((string) $row['deleted_at']) ?></td>
          <td>
            <form method="post" action="/admin/news/deleted.php">
              <?= Csrf::field() ?>
              <input type="hidden" name="action" value="restore">
              <input type="hidden" name="id" value="<?= (int) $row['id'] ?>">
              <button class="btn btn--sm" type="submit">復元する</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php adminPager($page, $totalPages, ''); ?>
</section>

<?php
adminFoot();
