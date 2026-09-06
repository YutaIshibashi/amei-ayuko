<?php

declare(strict_types=1);

/**
 * Contact settings.
 *
 * The form's field structure is fixed in code; what is editable here is the
 * notification address, the auto-reply wording, and the list of enquiry types
 * (label, help text and order). Changing an enquiry type never changes which
 * inputs the visitor sees — only the help text under the message box.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';
require_once dirname(__DIR__) . '/_layout.php';

use Amei\AuditLog;
use Amei\Auth;
use Amei\Csrf;
use Amei\Database;
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
    $action = (string) ($_POST['action'] ?? '');

    if ($action === 'save_settings') {
        $adminEmail = trim((string) ($_POST['contact_admin_email'] ?? ''));
        if ($adminEmail !== '' && filter_var($adminEmail, FILTER_VALIDATE_EMAIL) === false) {
            $errors['contact_admin_email'] = 'メールアドレスの形式が正しくありません。';
        }

        if ($errors === []) {
            Settings::saveMany([
                'contact_admin_email'     => $adminEmail,
                'contact_reply_from_name' => mb_substr(trim((string) ($_POST['contact_reply_from_name'] ?? '')), 0, 100),
                'contact_reply_subject'   => mb_substr(trim((string) ($_POST['contact_reply_subject'] ?? '')), 0, 200),
                'contact_reply_body'      => mb_substr((string) ($_POST['contact_reply_body'] ?? ''), 0, 2000),
            ]);
            AuditLog::write('contact_settings');
            Session::flash('お問い合わせ設定を保存しました。');
            header('Location: /admin/settings/contact.php');
            exit;
        }
    }

    if ($action === 'save_types') {
        /** @var array<int, array<string, string>> $rows */
        $rows = is_array($_POST['types'] ?? null) ? $_POST['types'] : [];
        Database::transaction(static function () use ($rows): void {
            foreach ($rows as $id => $row) {
                $id = (int) $id;
                if ($id <= 0) {
                    continue;
                }
                Database::run(
                    'UPDATE contact_types SET label = :l, help_text = :h, sort_order = :s, is_active = :a
                     WHERE id = :id',
                    [
                        ':l'  => mb_substr(trim((string) ($row['label'] ?? '')), 0, 100),
                        ':h'  => mb_substr(trim((string) ($row['help_text'] ?? '')), 0, 255),
                        ':s'  => (int) ($row['sort_order'] ?? 0),
                        ':a'  => isset($row['is_active']) ? 1 : 0,
                        ':id' => $id,
                    ]
                );
            }
        });
        AuditLog::write('contact_settings');
        Session::flash('問い合わせ種別を保存しました。');
        header('Location: /admin/settings/contact.php');
        exit;
    }

    if ($action === 'add_type') {
        $label = mb_substr(trim((string) ($_POST['new_label'] ?? '')), 0, 100);
        if ($label === '') {
            $errors['new_label'] = '項目名を入力してください。';
        } else {
            $max = (int) Database::value('SELECT COALESCE(MAX(sort_order), 0) FROM contact_types');
            Database::run(
                'INSERT INTO contact_types (label, help_text, sort_order) VALUES (:l, :h, :s)',
                [
                    ':l' => $label,
                    ':h' => mb_substr(trim((string) ($_POST['new_help'] ?? '')), 0, 255),
                    ':s' => $max + 10,
                ]
            );
            AuditLog::write('contact_settings');
            Session::flash('問い合わせ種別を追加しました。');
            header('Location: /admin/settings/contact.php');
            exit;
        }
    }
}

$settings = Settings::all();
$types = Database::all('SELECT * FROM contact_types ORDER BY sort_order ASC, id ASC');

adminHead('お問い合わせ設定');
?>

<?php if ($errors !== []): ?>
  <p class="banner banner--error" role="alert">入力内容をご確認ください。</p>
<?php endif; ?>

<form method="post" action="/admin/settings/contact.php">
  <?= Csrf::field() ?>
  <input type="hidden" name="action" value="save_settings">

  <section class="panel">
    <h2 class="panel__title">通知と自動返信</h2>

    <div class="field">
      <label class="field__label" for="contact_admin_email">管理者通知メールアドレス</label>
      <p class="field__help">
        お問い合わせを受け取るアドレスです。未設定の場合は <code>.env</code> の ADMIN_EMAIL が使われます。
        どちらも未設定だと送信できません。
      </p>
      <input class="input" id="contact_admin_email" name="contact_admin_email" type="email"
             aria-invalid="<?= isset($errors['contact_admin_email']) ? 'true' : 'false' ?>"
             value="<?= $e($_POST['contact_admin_email'] ?? $settings['contact_admin_email'] ?? '') ?>">
      <?php if (isset($errors['contact_admin_email'])): ?>
        <p class="field__error"><?= $e($errors['contact_admin_email']) ?></p>
      <?php endif; ?>
    </div>

    <div class="field">
      <label class="field__label" for="contact_reply_from_name">自動返信の送信者名</label>
      <input class="input" id="contact_reply_from_name" name="contact_reply_from_name" type="text"
             value="<?= $e($settings['contact_reply_from_name'] ?? 'amei ayuko') ?>">
    </div>

    <div class="field">
      <label class="field__label" for="contact_reply_subject">自動返信の件名</label>
      <input class="input" id="contact_reply_subject" name="contact_reply_subject" type="text"
             value="<?= $e($settings['contact_reply_subject'] ?? '') ?>">
    </div>

    <div class="field">
      <label class="field__label" for="contact_reply_body">自動返信の本文（冒頭のあいさつ）</label>
      <p class="field__help">
        この文章のあとに、お名前・種別・お問い合わせ内容・返信目安・署名が自動で続きます。
      </p>
      <textarea class="textarea" id="contact_reply_body" name="contact_reply_body"><?= $e($settings['contact_reply_body'] ?? '') ?></textarea>
    </div>

    <div class="actions">
      <button class="btn" type="submit">保存する</button>
    </div>
  </section>
</form>

<form method="post" action="/admin/settings/contact.php">
  <?= Csrf::field() ?>
  <input type="hidden" name="action" value="save_types">

  <section class="panel">
    <h2 class="panel__title">問い合わせ種別</h2>
    <p class="panel__note">
      並び順は数値が小さいものから表示されます。ヘルプ文は、その種別を選んだときに入力欄の下に表示されます。
      チェックを外すと、フォームの選択肢から外れます（過去のお問い合わせには影響しません）。
    </p>

    <div class="table-scroll">
      <table class="table">
        <thead><tr><th style="width:60px">表示</th><th>項目名</th><th>ヘルプ文</th><th style="width:90px">並び順</th></tr></thead>
        <tbody>
        <?php foreach ($types as $type): $id = (int) $type['id']; ?>
          <tr>
            <td>
              <input type="checkbox" name="types[<?= $id ?>][is_active]" value="1"
                     <?= (int) $type['is_active'] === 1 ? 'checked' : '' ?>
                     aria-label="<?= $e((string) $type['label']) ?> を表示する">
            </td>
            <td><input class="input" name="types[<?= $id ?>][label]" type="text" maxlength="100"
                       value="<?= $e((string) $type['label']) ?>"></td>
            <td><input class="input" name="types[<?= $id ?>][help_text]" type="text" maxlength="255"
                       value="<?= $e((string) $type['help_text']) ?>"></td>
            <td><input class="input" name="types[<?= $id ?>][sort_order]" type="number" step="10"
                       value="<?= (int) $type['sort_order'] ?>"></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    </div>

    <div class="actions">
      <button class="btn" type="submit">並び順・内容を保存</button>
    </div>
  </section>
</form>

<form method="post" action="/admin/settings/contact.php">
  <?= Csrf::field() ?>
  <input type="hidden" name="action" value="add_type">

  <section class="panel">
    <h2 class="panel__title">問い合わせ種別を追加</h2>
    <div class="row">
      <div>
        <label class="field__label" for="new_label">項目名</label>
        <input class="input" id="new_label" name="new_label" type="text" maxlength="100">
        <?php if (isset($errors['new_label'])): ?>
          <p class="field__error"><?= $e($errors['new_label']) ?></p>
        <?php endif; ?>
      </div>
      <div>
        <label class="field__label" for="new_help">ヘルプ文</label>
        <input class="input" id="new_help" name="new_help" type="text" maxlength="255">
      </div>
      <div style="flex:0 0 auto">
        <button class="btn btn--ghost" type="submit">追加する</button>
      </div>
    </div>
  </section>
</form>

<?php
adminFoot();
