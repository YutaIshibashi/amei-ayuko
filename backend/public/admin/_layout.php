<?php

declare(strict_types=1);

namespace Amei\Admin;

use Amei\Auth;
use Amei\Csrf;
use Amei\Http;
use Amei\Maintenance;
use Amei\Sanitizer;
use Amei\Session;

/**
 * Shared chrome for the admin screens.
 *
 * The admin UI is deliberately plain and functional — the brand work belongs
 * on the public site. What matters here is that every destructive action is
 * behind a confirmation and every form carries a CSRF token.
 */

const ADMIN_NAV = [
    ['/admin/',                     'ダッシュボード'],
    ['/admin/news/',                'お知らせ'],
    ['/admin/main-visual.php',      'メインビジュアル'],
    ['/admin/settings/site.php',    'サイト設定'],
    ['/admin/settings/contact.php', 'お問い合わせ設定'],
    ['/admin/sync.php',             'Shop Sync Status'],
    ['/admin/settings/analytics.php', 'アクセス解析'],
];

/** Marks the nav item whose section the current script belongs to. */
function isCurrentNav(string $script, string $href): bool
{
    if ($href === '/admin/') {
        return $script === '/admin/index.php' || $script === '/admin/';
    }
    if (str_ends_with($href, '/')) {
        return str_starts_with($script, $href);
    }
    return $script === $href;
}

function adminHead(string $title): void
{
    Http::securityHeaders(true);
    header('Content-Type: text/html; charset=UTF-8');
    // The admin area must never be cached or indexed.
    header('Cache-Control: no-store, no-cache, must-revalidate, private');
    header('X-Robots-Tag: noindex, nofollow, noarchive');

    $e = static fn (string $v): string => Sanitizer::e($v);
    $current = $_SERVER['SCRIPT_NAME'] ?? '';
    ?>
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= $e($title) ?> | amei ayuko 管理画面</title>
<link rel="icon" href="/brand/logo-mark.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin/assets/admin.css?v=1">
</head>
<body>
<?php if (Maintenance::isActive()): ?>
  <p class="banner banner--warn">
    メンテナンスモードが有効です。公開サイトは503を返し、Shop Syncとお問い合わせは停止しています。
  </p>
<?php endif; ?>

<header class="topbar">
  <a class="topbar__brand" href="/admin/">
    <img src="/brand/logo-mark.svg" alt="" width="28" height="28">
    <span>amei ayuko <small>管理画面</small></span>
  </a>
  <div class="topbar__right">
    <a class="topbar__link" href="/" target="_blank" rel="noopener">公開サイトを見る</a>
    <?php if (Auth::check()): ?>
      <form method="post" action="/admin/logout.php" class="topbar__logout">
        <?= Csrf::field() ?>
        <button type="submit" class="btn btn--ghost btn--sm">ログアウト</button>
      </form>
    <?php endif; ?>
  </div>
</header>

<?php if (Auth::check()): ?>
<nav class="nav" aria-label="管理メニュー">
  <?php foreach (ADMIN_NAV as [$href, $label]): ?>
    <a class="nav__link<?= isCurrentNav($current, $href) ? ' is-active' : '' ?>"
       href="<?= $e($href) ?>"><?= $e($label) ?></a>
  <?php endforeach; ?>
</nav>
<?php endif; ?>

<main class="wrap">
  <h1 class="page-title"><?= $e($title) ?></h1>
<?php
    foreach (Session::takeFlashes() as $flash) {
        $class = $flash['type'] === 'error' ? 'banner--error' : 'banner--ok';
        echo '<p class="banner ' . $class . '">' . $e($flash['message']) . '</p>';
    }
}

function adminFoot(): void
{
    ?>
</main>
<footer class="foot">
  <small>amei ayuko 管理画面</small>
</footer>
<script src="/admin/assets/admin.js?v=1" defer></script>
</body>
</html>
<?php
}

/** Renders a pagination strip for the admin tables. */
function adminPager(int $page, int $totalPages, string $baseQuery): void
{
    if ($totalPages <= 1) {
        return;
    }
    echo '<nav class="pager" aria-label="ページ送り">';
    for ($p = 1; $p <= $totalPages; $p++) {
        $href = '?' . ($baseQuery === '' ? '' : $baseQuery . '&') . 'page=' . $p;
        $class = $p === $page ? 'pager__link is-current' : 'pager__link';
        $aria = $p === $page ? ' aria-current="page"' : '';
        echo '<a class="' . $class . '" href="' . Sanitizer::e($href) . '"' . $aria . '>' . $p . '</a>';
    }
    echo '</nav>';
}
