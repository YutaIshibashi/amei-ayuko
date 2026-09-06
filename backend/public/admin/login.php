<?php

declare(strict_types=1);

/**
 * Admin login.
 *
 * Failures are deliberately vague ("いずれかが正しくありません") so the form
 * cannot be used to discover whether an account name exists. Five failures on
 * either the IP or the account lock both for fifteen minutes.
 */

require_once dirname(__DIR__) . '/_app/bootstrap.php';
require_once __DIR__ . '/_layout.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\Sanitizer;
use Amei\Session;

use function Amei\Admin\adminFoot;
use function Amei\Admin\adminHead;

Session::start();

if (Auth::check()) {
    header('Location: /admin/');
    exit;
}

$error = '';
$username = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    Csrf::requirePost();

    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');

    if (Auth::isLocked($username)) {
        $error = 'ログインの試行回数が上限に達しました。'
            . Auth::lockMinutes() . '分ほど時間をおいてから、もう一度お試しください。';
    } elseif ($username === '' || $password === '') {
        $error = 'ユーザー名とパスワードを入力してください。';
    } elseif (Auth::attempt($username, $password)) {
        // Only same-origin paths are accepted as a redirect target.
        $redirect = (string) ($_GET['redirect'] ?? '/admin/');
        if (!str_starts_with($redirect, '/') || str_starts_with($redirect, '//')) {
            $redirect = '/admin/';
        }
        header('Location: ' . $redirect);
        exit;
    } else {
        $error = 'ユーザー名またはパスワードが正しくありません。';
    }
}

adminHead('ログイン');
?>
<div class="login">
  <div class="panel">
    <?php if ($error !== ''): ?>
      <p class="banner banner--error" role="alert"><?= Sanitizer::e($error) ?></p>
    <?php endif; ?>

    <form method="post" action="<?= Sanitizer::e($_SERVER['REQUEST_URI'] ?? '/admin/login.php') ?>">
      <?= Csrf::field() ?>
      <div class="field">
        <label class="field__label" for="username">ユーザー名</label>
        <input class="input" id="username" name="username" type="text"
               autocomplete="username" required autofocus
               value="<?= Sanitizer::e($username) ?>">
      </div>
      <div class="field">
        <label class="field__label" for="password">パスワード</label>
        <input class="input" id="password" name="password" type="password"
               autocomplete="current-password" required>
      </div>
      <button class="btn" type="submit" style="width:100%">ログイン</button>
    </form>

    <p class="field__help" style="margin-top:16px">
      パスワードを忘れた場合は、開発者にご連絡ください（データベース上でリセットします）。
    </p>
  </div>
</div>
<?php
adminFoot();
