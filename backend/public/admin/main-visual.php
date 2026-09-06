<?php

declare(strict_types=1);

/**
 * Hero main visual.
 *
 * Only the image is editable — the hero copy is brand voice and lives in code.
 * The three most recent uploads are kept so a change can be reverted in one
 * click; older ones are pruned along with their files.
 */

require_once dirname(__DIR__) . '/_app/bootstrap.php';
require_once __DIR__ . '/_layout.php';

use Amei\AuditLog;
use Amei\Auth;
use Amei\Csrf;
use Amei\Database;
use Amei\ImageService;
use Amei\Sanitizer;
use Amei\Session;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Auth::requireLogin();

const HISTORY_LIMIT = 3;

$e = static fn (?string $v): string => Sanitizer::e($v);
$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();
    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'upload') {
        try {
            $stored = ImageService::storeAsWebp(
                $_FILES['image'] ?? [],
                WEB_ROOT . '/uploads/main-visual',
                '/uploads/main-visual',
                2000,  // long edge
                84,
            );

            Database::transaction(static function () use ($stored): void {
                Database::run('UPDATE main_visuals SET is_current = 0');
                Database::run(
                    'INSERT INTO main_visuals (image_path, width, height, is_current)
                     VALUES (:p, :w, :h, 1)',
                    [':p' => $stored['path'], ':w' => $stored['width'], ':h' => $stored['height']]
                );
            });

            pruneHistory();
            AuditLog::write('main_visual', $stored['path']);
            Session::flash('メインビジュアルを変更しました。');
            header('Location: /admin/main-visual.php');
            exit;
        } catch (\RuntimeException $ex) {
            $error = $ex->getMessage();
        }
    }

    if ($action === 'activate') {
        $id = (int) ($_POST['id'] ?? 0);
        $exists = Database::one('SELECT image_path FROM main_visuals WHERE id = :id', [':id' => $id]);
        if ($exists !== null) {
            Database::transaction(static function () use ($id): void {
                Database::run('UPDATE main_visuals SET is_current = 0');
                Database::run('UPDATE main_visuals SET is_current = 1 WHERE id = :id', [':id' => $id]);
            });
            AuditLog::write('main_visual', (string) $id);
            Session::flash('メインビジュアルを切り替えました。');
        }
        header('Location: /admin/main-visual.php');
        exit;
    }
}

/** Keeps the three most recent images; deletes the files of the rest. */
function pruneHistory(): void
{
    $keep = Database::all(
        'SELECT id FROM main_visuals ORDER BY uploaded_at DESC, id DESC LIMIT ' . HISTORY_LIMIT
    );
    if ($keep === []) {
        return;
    }
    $keepIds = array_map(static fn (array $r): int => (int) $r['id'], $keep);
    $placeholders = implode(',', array_fill(0, count($keepIds), '?'));

    $stale = Database::all("SELECT id, image_path FROM main_visuals WHERE id NOT IN ({$placeholders})", $keepIds);
    foreach ($stale as $row) {
        ImageService::deletePublicFile((string) $row['image_path']);
        Database::run('DELETE FROM main_visuals WHERE id = :id', [':id' => (int) $row['id']]);
    }
}

$visuals = Database::all('SELECT * FROM main_visuals ORDER BY uploaded_at DESC, id DESC LIMIT ' . HISTORY_LIMIT);

adminHead('メインビジュアル');
?>

<?php if ($error !== ''): ?>
  <p class="banner banner--error" role="alert"><?= $e($error) ?></p>
<?php endif; ?>

<section class="panel">
  <h2 class="panel__title">新しい画像をアップロード</h2>
  <p class="panel__note">
    TOPページのメインビジュアル画像を差し替えます。長辺2000pxのWebPへ自動変換します。
    表示枠は正方形（PC）／4:3（スマートフォン）に切り抜かれるため、中央に主役が写った写真がおすすめです。
    <br>
    ヒーローのキャッチコピーは管理画面からは変更できません。
  </p>

  <form method="post" enctype="multipart/form-data" action="/admin/main-visual.php">
    <?= Csrf::field() ?>
    <input type="hidden" name="action" value="upload">
    <div class="field">
      <label class="field__label" for="image">画像ファイル</label>
      <input class="input" id="image" name="image" type="file" accept="image/*" required>
      <p class="field__help">JPEG / PNG / WebP / GIF、最大12MB。</p>
    </div>
    <button class="btn" type="submit">アップロードして反映</button>
  </form>
</section>

<section class="panel">
  <h2 class="panel__title">履歴（直近<?= HISTORY_LIMIT ?>件）</h2>
  <?php if ($visuals === []): ?>
    <p class="empty">まだ画像がアップロードされていません。標準のイラストが表示されます。</p>
  <?php else: ?>
    <div class="grid grid--2">
      <?php foreach ($visuals as $visual): ?>
        <div>
          <img class="preview" src="<?= $e((string) $visual['image_path']) ?>" alt=""
               width="<?= (int) $visual['width'] ?>" height="<?= (int) $visual['height'] ?>" loading="lazy">
          <p class="muted mono"><?= $e((string) $visual['uploaded_at']) ?></p>
          <?php if ((int) $visual['is_current'] === 1): ?>
            <p><span class="badge badge--published">現在表示中</span></p>
          <?php else: ?>
            <form method="post" action="/admin/main-visual.php">
              <?= Csrf::field() ?>
              <input type="hidden" name="action" value="activate">
              <input type="hidden" name="id" value="<?= (int) $visual['id'] ?>">
              <button class="btn btn--ghost btn--sm" type="submit">この画像に戻す</button>
            </form>
          <?php endif; ?>
        </div>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>

<?php
adminFoot();
