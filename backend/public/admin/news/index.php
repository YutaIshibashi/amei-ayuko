<?php

declare(strict_types=1);

/**
 * News list.
 *
 * Ten per page, sorted by published_at DESC (fixed), with title search and
 * status / category filters. Quick actions live in the row; the destructive
 * ones (unpublish, delete) go through a confirmation.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\Http;
use Amei\NewsRepository;
use Amei\Sanitizer;
use Amei\Session;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;
use function Amei\Admin\adminPager;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);

/* --- actions ------------------------------------------------------------ */
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();
    $action = (string) ($_POST['action'] ?? '');
    $id = (int) ($_POST['id'] ?? 0);

    if ($id > 0) {
        switch ($action) {
            case 'publish':
                NewsRepository::setStatus($id, 'published');
                Session::flash('記事を公開しました。');
                break;
            case 'unpublish':
                NewsRepository::setStatus($id, 'private');
                Session::flash('記事を非公開にしました。');
                break;
            case 'delete':
                NewsRepository::delete($id);
                Session::flash('記事を削除しました。削除済み一覧から復元できます。');
                break;
            case 'create':
                $newId = NewsRepository::createDraft();
                header('Location: /admin/news/edit.php?id=' . $newId);
                exit;
        }
    }

    // POST/redirect/GET, so a refresh cannot repeat the action.
    header('Location: /admin/news/?' . http_build_query(array_filter([
        'q'        => (string) ($_POST['q'] ?? ''),
        'status'   => (string) ($_POST['status'] ?? ''),
        'category' => (string) ($_POST['category'] ?? ''),
        'page'     => (string) ($_POST['page'] ?? ''),
    ])));
    exit;
}

/* --- listing ------------------------------------------------------------ */
$page = max(1, (int) ($_GET['page'] ?? 1));
$search = trim((string) ($_GET['q'] ?? ''));
$status = (string) ($_GET['status'] ?? '');
$category = (string) ($_GET['category'] ?? '');

$result = NewsRepository::adminList($page, $search, $status, $category);
$totalPages = max(1, (int) ceil($result['total'] / NewsRepository::PER_PAGE));
$baseQuery = http_build_query(array_filter(['q' => $search, 'status' => $status, 'category' => $category]));

adminHead('お知らせ');
?>

<div class="row row--tight" style="margin-bottom:16px">
  <form method="post" action="/admin/news/">
    <?= Csrf::field() ?>
    <input type="hidden" name="action" value="create">
    <button class="btn" type="submit">新規作成</button>
  </form>
  <a class="btn btn--ghost" href="/admin/news/deleted.php">削除済み一覧</a>
</div>

<section class="panel">
  <form method="get" action="/admin/news/" class="row">
    <div>
      <label class="field__label" for="q">タイトル検索</label>
      <input class="input" id="q" name="q" type="search" value="<?= $e($search) ?>" placeholder="タイトルの一部">
    </div>
    <div>
      <label class="field__label" for="status">ステータス</label>
      <select class="select" id="status" name="status">
        <option value="">すべて</option>
        <?php foreach (NewsRepository::STATUSES as $key => $label): ?>
          <option value="<?= $e($key) ?>"<?= $status === $key ? ' selected' : '' ?>><?= $e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div>
      <label class="field__label" for="category">カテゴリ</label>
      <select class="select" id="category" name="category">
        <option value="">すべて</option>
        <?php foreach (NewsRepository::CATEGORIES as $key => $label): ?>
          <option value="<?= $e($key) ?>"<?= $category === $key ? ' selected' : '' ?>><?= $e($label) ?></option>
        <?php endforeach; ?>
      </select>
    </div>
    <div style="flex:0 0 auto">
      <button class="btn btn--ghost" type="submit">絞り込む</button>
    </div>
  </form>
</section>

<section class="panel">
  <p class="panel__note"><?= (int) $result['total'] ?>件（公開日の新しい順）</p>
  <div class="table-scroll">
    <table class="table">
      <thead>
        <tr>
          <th>ID</th><th>画像</th><th>タイトル</th><th>カテゴリ</th>
          <th>ステータス</th><th>公開日時</th><th>操作</th>
        </tr>
      </thead>
      <tbody>
      <?php if ($result['items'] === []): ?>
        <tr><td colspan="7" class="empty">該当する記事がありません。</td></tr>
      <?php endif; ?>
      <?php foreach ($result['items'] as $row): $id = (int) $row['id']; ?>
        <tr>
          <td class="num"><?= $id ?></td>
          <td>
            <?php if (($row['image_path'] ?? '') !== ''): ?>
              <img class="thumb" src="<?= $e((string) $row['image_path']) ?>" alt="" width="56" height="56" loading="lazy">
            <?php else: ?>
              <span class="muted">—</span>
            <?php endif; ?>
          </td>
          <td>
            <a href="/admin/news/edit.php?id=<?= $id ?>">
              <?= ($row['title'] ?? '') === '' ? '<span class="muted">（無題）</span>' : $e((string) $row['title']) ?>
            </a>
          </td>
          <td class="nowrap"><?= $e(NewsRepository::categoryLabel((string) $row['category'])) ?></td>
          <td>
            <span class="badge badge--<?= $e((string) $row['status']) ?>">
              <?= $e(NewsRepository::STATUSES[(string) $row['status']] ?? (string) $row['status']) ?>
            </span>
          </td>
          <td class="nowrap mono"><?= $e((string) ($row['published_at'] ?? '—')) ?></td>
          <td>
            <div class="cell-actions">
              <a class="btn btn--ghost btn--sm" href="/admin/news/edit.php?id=<?= $id ?>">編集</a>
              <a class="btn btn--ghost btn--sm" href="/admin/news/preview.php?id=<?= $id ?>" target="_blank" rel="noopener">プレビュー</a>

              <?php if ((string) $row['status'] === 'published'): ?>
                <form method="post" action="/admin/news/">
                  <?= Csrf::field() ?>
                  <input type="hidden" name="action" value="unpublish">
                  <input type="hidden" name="id" value="<?= $id ?>">
                  <input type="hidden" name="q" value="<?= $e($search) ?>">
                  <input type="hidden" name="page" value="<?= $page ?>">
                  <!-- Taking something offline is confirmed; putting it online is not. -->
                  <button class="btn btn--ghost btn--sm" type="submit"
                          data-confirm="この記事を非公開にします。公開サイトから見えなくなります。よろしいですか？">
                    非公開にする
                  </button>
                </form>
              <?php else: ?>
                <form method="post" action="/admin/news/">
                  <?= Csrf::field() ?>
                  <input type="hidden" name="action" value="publish">
                  <input type="hidden" name="id" value="<?= $id ?>">
                  <input type="hidden" name="q" value="<?= $e($search) ?>">
                  <input type="hidden" name="page" value="<?= $page ?>">
                  <button class="btn btn--sm" type="submit">公開する</button>
                </form>
              <?php endif; ?>

              <form method="post" action="/admin/news/">
                <?= Csrf::field() ?>
                <input type="hidden" name="action" value="delete">
                <input type="hidden" name="id" value="<?= $id ?>">
                <input type="hidden" name="q" value="<?= $e($search) ?>">
                <input type="hidden" name="page" value="<?= $page ?>">
                <button class="btn btn--danger btn--sm" type="submit"
                        data-confirm="この記事を削除します。削除済み一覧から復元できます。よろしいですか？">
                  削除
                </button>
              </form>
            </div>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php adminPager($page, $totalPages, $baseQuery); ?>
</section>

<?php
adminFoot();
