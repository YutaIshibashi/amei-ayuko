<?php

declare(strict_types=1);

/**
 * News editor.
 *
 * Two distinct save paths, and the difference matters:
 *   - auto-save (every 30s, via autosave.php) writes to `news_autosaves` only;
 *   - "更新" writes to `news`, which is the only thing the public reads.
 * So editing a live article never leaks a half-finished sentence to visitors.
 *
 * The image is replaced in a safe order too: process the new file, save it,
 * switch the database, and only then delete the old one — and only on a
 * successful update, never while the form is still open.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\ImageService;
use Amei\Logger;
use Amei\NewsRepository;
use Amei\ProductRepository;
use Amei\Sanitizer;
use Amei\Session;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);

$id = (int) ($_GET['id'] ?? 0);
$article = $id > 0 ? NewsRepository::find($id) : null;
if ($article === null) {
    Session::flash('記事が見つかりませんでした。', 'error');
    header('Location: /admin/news/');
    exit;
}

$errors = [];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();

    $title = trim((string) ($_POST['title'] ?? ''));
    $bodyRaw = (string) ($_POST['body'] ?? '');
    $category = (string) ($_POST['category'] ?? 'info');
    $status = (string) ($_POST['status'] ?? 'draft');
    $publishedAtRaw = trim((string) ($_POST['published_at'] ?? ''));
    $relatedProductId = trim((string) ($_POST['related_product_id'] ?? ''));
    $removeImage = ($_POST['remove_image'] ?? '') === '1';

    if ($title === '') {
        $errors['title'] = 'タイトルを入力してください。';
    } elseif (mb_strlen($title) > 255) {
        $errors['title'] = 'タイトルは255文字以内で入力してください。';
    }
    if (!isset(NewsRepository::CATEGORIES[$category])) {
        $errors['category'] = 'カテゴリを選択してください。';
    }
    if (!isset(NewsRepository::STATUSES[$status])) {
        $errors['status'] = 'ステータスを選択してください。';
    }

    // `datetime-local` gives "Y-m-dTH:i"; store it as a MySQL DATETIME.
    $publishedAt = null;
    if ($publishedAtRaw !== '') {
        $normalised = str_replace('T', ' ', $publishedAtRaw);
        $timestamp = strtotime($normalised);
        if ($timestamp === false) {
            $errors['published_at'] = '公開日時の形式が正しくありません。';
        } else {
            $publishedAt = date('Y-m-d H:i:s', $timestamp);
        }
    }
    if (in_array($status, ['published', 'scheduled'], true) && $publishedAt === null) {
        $errors['published_at'] = '公開・予約公開には公開日時が必要です。';
    }

    if ($relatedProductId !== '' && ProductRepository::find($relatedProductId) === null) {
        $errors['related_product_id'] = '選択された商品が見つかりません。';
    }

    // Sanitised before storage, so the stored value is always safe to render.
    $body = \Amei\Sanitizer::html($bodyRaw);

    /* --- image ---------------------------------------------------------- */
    $previousImage = null;
    $imageChanged = false;
    $uploaded = $_FILES['image'] ?? null;

    if ($errors === [] && is_array($uploaded) && ($uploaded['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE) {
        try {
            $stored = ImageService::storeAsWebp(
                $uploaded,
                WEB_ROOT . '/uploads/news',
                '/uploads/news',
                1200,   // long edge
                82,
            );
            $previousImage = NewsRepository::setImage($id, $stored);
            $imageChanged = true;
        } catch (\RuntimeException $ex) {
            $errors['image'] = $ex->getMessage();
            Logger::error(Logger::CHANNEL_IMAGE, 'News image upload failed', ['news_id' => $id]);
        }
    } elseif ($errors === [] && $removeImage) {
        $previousImage = NewsRepository::setImage($id, null);
        $imageChanged = true;
    }

    if ($errors === []) {
        NewsRepository::update($id, [
            'title'              => $title,
            'body'               => $body,
            'category'           => $category,
            'status'             => $status,
            'published_at'       => $publishedAt,
            'related_product_id' => $relatedProductId === '' ? null : $relatedProductId,
        ]);

        // Old file removed only now, once the new state is committed.
        if ($imageChanged && $previousImage !== null) {
            ImageService::deletePublicFile($previousImage);
        }

        Session::flash('記事を更新しました。');
        header('Location: /admin/news/edit.php?id=' . $id);
        exit;
    }

    // Re-render with what the user typed rather than what is stored.
    $article = array_merge($article, [
        'title'              => $title,
        'body'               => $body,
        'category'           => $category,
        'status'             => $status,
        'published_at'       => $publishedAt,
        'related_product_id' => $relatedProductId,
    ]);
}

$autosave = NewsRepository::autosaveFor($id);
$products = ProductRepository::all();
$publishedAtValue = is_string($article['published_at'] ?? null) && $article['published_at'] !== ''
    ? str_replace(' ', 'T', substr((string) $article['published_at'], 0, 16))
    : '';

adminHead('お知らせの編集');
?>

<?php if ($errors !== []): ?>
  <p class="banner banner--error" role="alert">入力内容をご確認ください。</p>
<?php endif; ?>

<?php if ($autosave !== null): ?>
  <p class="banner banner--warn">
    <strong>自動保存された下書きがあります</strong>（<?= $e((string) $autosave['saved_at']) ?>）。
    この内容は公開サイトには反映されていません。
    <button class="btn btn--ghost btn--sm" type="button" id="restore-autosave"
            data-title="<?= $e((string) $autosave['title']) ?>">自動保存の内容を読み込む</button>
    <template id="autosave-body"><?= $e((string) $autosave['body']) ?></template>
  </p>
<?php endif; ?>

<form method="post" enctype="multipart/form-data" id="news-form"
      action="/admin/news/edit.php?id=<?= $id ?>" data-news-id="<?= $id ?>">
  <?= Csrf::field() ?>

  <div class="grid grid--2">
    <section class="panel">
      <h2 class="panel__title">本文</h2>

      <div class="field">
        <label class="field__label" for="title">タイトル</label>
        <input class="input" id="title" name="title" type="text" maxlength="255" required
               aria-invalid="<?= isset($errors['title']) ? 'true' : 'false' ?>"
               value="<?= $e((string) $article['title']) ?>">
        <?php if (isset($errors['title'])): ?>
          <p class="field__error"><?= $e($errors['title']) ?></p>
        <?php endif; ?>
      </div>

      <div class="field">
        <label class="field__label" for="body">本文</label>
        <p class="field__help">
          使用できるタグ：見出し(h2/h3)・太字(strong)・リンク(a)・リスト(ul/ol/li)・引用(blockquote)・段落(p)・改行(br)。
          それ以外のタグは保存時に自動で取り除かれます。
        </p>
        <div class="toolbar" role="group" aria-label="書式">
          <button class="btn btn--sm" type="button" data-wrap="h2">見出し2</button>
          <button class="btn btn--sm" type="button" data-wrap="h3">見出し3</button>
          <button class="btn btn--sm" type="button" data-wrap="strong">太字</button>
          <button class="btn btn--sm" type="button" data-wrap="p">段落</button>
          <button class="btn btn--sm" type="button" data-wrap="blockquote">引用</button>
          <button class="btn btn--sm" type="button" data-list="ul">箇条書き</button>
          <button class="btn btn--sm" type="button" data-list="ol">番号付き</button>
          <button class="btn btn--sm" type="button" data-link="1">リンク</button>
        </div>
        <textarea class="textarea textarea--body editor" id="body" name="body"><?= $e((string) $article['body']) ?></textarea>
        <p class="autosave-state" id="autosave-state" aria-live="polite"></p>
      </div>
    </section>

    <div>
      <section class="panel">
        <h2 class="panel__title">公開設定</h2>

        <div class="field">
          <label class="field__label" for="status">ステータス</label>
          <select class="select" id="status" name="status">
            <?php foreach (NewsRepository::STATUSES as $key => $label): ?>
              <option value="<?= $e($key) ?>"<?= (string) $article['status'] === $key ? ' selected' : '' ?>>
                <?= $e($label) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <p class="field__help">
            「予約公開」は公開日時を未来にすると、その時刻を過ぎた時点で自動的に公開されます
            （cronは不要です）。過去の日時も指定できます。
          </p>
        </div>

        <div class="field">
          <label class="field__label" for="published_at">公開日時</label>
          <input class="input" id="published_at" name="published_at" type="datetime-local"
                 value="<?= $e($publishedAtValue) ?>"
                 aria-invalid="<?= isset($errors['published_at']) ? 'true' : 'false' ?>">
          <?php if (isset($errors['published_at'])): ?>
            <p class="field__error"><?= $e($errors['published_at']) ?></p>
          <?php endif; ?>
        </div>

        <div class="field">
          <label class="field__label" for="category">カテゴリ</label>
          <select class="select" id="category" name="category">
            <?php foreach (NewsRepository::CATEGORIES as $key => $label): ?>
              <option value="<?= $e($key) ?>"<?= (string) $article['category'] === $key ? ' selected' : '' ?>>
                <?= $e($label) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">記事画像</h2>
        <p class="panel__note">
          1記事につき1枚まで。長辺1200pxのWebPへ自動変換します。画像なしでも公開できます
          （一覧にダミー画像は表示されません）。
        </p>

        <?php if (($article['image_path'] ?? '') !== ''): ?>
          <p><img class="preview" src="<?= $e((string) $article['image_path']) ?>" alt="現在の記事画像"
                  width="<?= (int) ($article['image_width'] ?? 320) ?>"
                  height="<?= (int) ($article['image_height'] ?? 200) ?>"></p>
          <label class="field">
            <input type="checkbox" name="remove_image" value="1">
            この画像を削除する（「更新」時に反映されます）
          </label>
        <?php endif; ?>

        <div class="field">
          <label class="field__label" for="image">画像を差し替える</label>
          <input class="input" id="image" name="image" type="file" accept="image/*">
          <?php if (isset($errors['image'])): ?>
            <p class="field__error"><?= $e($errors['image']) ?></p>
          <?php endif; ?>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__title">関連商品</h2>
        <p class="panel__note">
          同期済みの商品から1件だけ選べます。記事に「この商品を見る」ボタンが表示されます。
        </p>
        <div class="field">
          <label class="field__label" for="related_product_id">商品</label>
          <select class="select" id="related_product_id" name="related_product_id">
            <option value="">設定しない</option>
            <?php foreach ($products as $product): ?>
              <option value="<?= $e((string) $product['id']) ?>"
                <?= (string) ($article['related_product_id'] ?? '') === (string) $product['id'] ? ' selected' : '' ?>>
                <?= $e(ProductRepository::categoryLabel((string) $product['category'])) ?>｜<?= $e((string) $product['name']) ?>
              </option>
            <?php endforeach; ?>
          </select>
          <?php if (isset($errors['related_product_id'])): ?>
            <p class="field__error"><?= $e($errors['related_product_id']) ?></p>
          <?php endif; ?>
        </div>
      </section>
    </div>
  </div>

  <div class="actions">
    <button class="btn" type="submit">更新（公開内容へ反映）</button>
    <button class="btn btn--ghost" type="button" id="save-draft">下書き保存</button>
    <a class="btn btn--ghost" href="/admin/news/preview.php?id=<?= $id ?>" target="_blank" rel="noopener">プレビュー</a>
    <a class="btn btn--ghost" href="/admin/news/">一覧へ戻る</a>
  </div>
</form>

<?php
adminFoot();
