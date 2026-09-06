<?php

declare(strict_types=1);

/**
 * Site settings.
 *
 * Values only: the layout is not editable from here. The key list is owned by
 * `Amei\Settings::KEYS`, so the form cannot introduce a setting nothing reads.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\AuditLog;
use Amei\Auth;
use Amei\Csrf;
use Amei\Sanitizer;
use Amei\Session;
use Amei\Settings;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Auth::requireLogin();

$e = static fn (?string $v): string => Sanitizer::e($v);
$errors = [];

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();

    $values = [];
    foreach (Settings::KEYS as $key => [$label, $type]) {
        $value = trim((string) ($_POST[$key] ?? ''));

        if ($type === 'url' && $value !== '') {
            if (filter_var($value, FILTER_VALIDATE_URL) === false || !preg_match('#^https?://#i', $value)) {
                $errors[$key] = 'http(s):// から始まるURLを入力してください。';
                continue;
            }
        }
        if ($key === 'ga4_measurement_id' && $value !== '' && preg_match('/^G-[A-Z0-9]{4,20}$/i', $value) !== 1) {
            $errors[$key] = 'GA4の測定IDは「G-XXXXXXX」の形式です。';
            continue;
        }
        if ($type === 'image' && $value !== '' && !str_starts_with($value, '/') && !preg_match('#^https?://#i', $value)) {
            $errors[$key] = '「/」から始まるパス、またはURLを入力してください。';
            continue;
        }

        $values[$key] = mb_substr($value, 0, 2000);
    }

    if ($errors === []) {
        Settings::saveMany($values);
        AuditLog::write('site_settings');
        Session::flash('サイト設定を保存しました。');
        header('Location: /admin/settings/site.php');
        exit;
    }
}

$current = Settings::all();

adminHead('サイト設定');
?>

<?php if ($errors !== []): ?>
  <p class="banner banner--error" role="alert">入力内容をご確認ください。</p>
<?php endif; ?>

<form method="post" action="/admin/settings/site.php">
  <?= Csrf::field() ?>

  <section class="panel">
    <h2 class="panel__title">基本情報・SEO</h2>
    <?php foreach (['site_title', 'meta_description', 'ogp_image', 'ga4_measurement_id', 'search_console_verification'] as $key): ?>
      <?php [$label, $type] = Settings::KEYS[$key]; ?>
      <div class="field">
        <label class="field__label" for="<?= $e($key) ?>"><?= $e($label) ?></label>
        <?php if ($key === 'meta_description'): ?>
          <p class="field__help">検索結果に表示される説明文です。全角80文字程度が目安です。</p>
        <?php elseif ($key === 'ogp_image'): ?>
          <p class="field__help">SNSでシェアされたときの共通画像（1200×630px推奨）。「/brand/ogp-default.png」のようなパスで指定します。</p>
        <?php elseif ($key === 'ga4_measurement_id'): ?>
          <p class="field__help">空欄にするとGoogleアナリティクスは読み込まれません。Cookie同意前は、IDを設定していても読み込まれません。</p>
        <?php elseif ($key === 'search_console_verification'): ?>
          <p class="field__help">Search Consoleの「HTMLタグ」による確認コード（content属性の値のみ）。</p>
        <?php endif; ?>
        <?php if ($type === 'textarea'): ?>
          <textarea class="textarea" id="<?= $e($key) ?>" name="<?= $e($key) ?>"><?= $e($current[$key] ?? '') ?></textarea>
        <?php else: ?>
          <input class="input" id="<?= $e($key) ?>" name="<?= $e($key) ?>" type="text"
                 aria-invalid="<?= isset($errors[$key]) ? 'true' : 'false' ?>"
                 value="<?= $e($_POST[$key] ?? $current[$key] ?? '') ?>">
        <?php endif; ?>
        <?php if (isset($errors[$key])): ?><p class="field__error"><?= $e($errors[$key]) ?></p><?php endif; ?>
      </div>
    <?php endforeach; ?>
  </section>

  <section class="panel">
    <h2 class="panel__title">サイト内の文言</h2>
    <?php foreach (['brand_concept', 'about_intro', 'contact_intro', 'footer_copy', 'copyright'] as $key): ?>
      <?php [$label, $type] = Settings::KEYS[$key]; ?>
      <div class="field">
        <label class="field__label" for="<?= $e($key) ?>"><?= $e($label) ?></label>
        <?php if ($type === 'textarea'): ?>
          <textarea class="textarea" id="<?= $e($key) ?>" name="<?= $e($key) ?>"><?= $e($_POST[$key] ?? $current[$key] ?? '') ?></textarea>
        <?php else: ?>
          <input class="input" id="<?= $e($key) ?>" name="<?= $e($key) ?>" type="text"
                 value="<?= $e($_POST[$key] ?? $current[$key] ?? '') ?>">
        <?php endif; ?>
      </div>
    <?php endforeach; ?>
    <p class="panel__note" style="margin:0">
      ヒーローのキャッチコピー、Aboutの本文、プライバシーポリシーはコード側で管理しており、ここからは変更できません。
    </p>
  </section>

  <section class="panel">
    <h2 class="panel__title">SNS・販売サイトのURL</h2>
    <p class="panel__note">フッターと各所のリンク先です。空欄にすると、そのリンクは表示されません。</p>
    <?php foreach (['instagram_url', 'minne_url', 'creema_url', 'mercari_url', 'inframe_url', 'base_url', 'rakuma_url'] as $key): ?>
      <?php [$label] = Settings::KEYS[$key]; ?>
      <div class="field">
        <label class="field__label" for="<?= $e($key) ?>"><?= $e($label) ?></label>
        <input class="input" id="<?= $e($key) ?>" name="<?= $e($key) ?>" type="url"
               aria-invalid="<?= isset($errors[$key]) ? 'true' : 'false' ?>"
               value="<?= $e($_POST[$key] ?? $current[$key] ?? '') ?>">
        <?php if (isset($errors[$key])): ?><p class="field__error"><?= $e($errors[$key]) ?></p><?php endif; ?>
      </div>
    <?php endforeach; ?>
  </section>

  <div class="actions">
    <button class="btn" type="submit">保存する</button>
  </div>
</form>

<?php
adminFoot();
