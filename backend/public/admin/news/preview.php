<?php

declare(strict_types=1);

/**
 * Admin-only article preview.
 *
 * Reachable only with an admin session — there is no public preview token, so
 * an unpublished draft cannot leak through a shared URL. Rendered with the
 * public site's article styles so the preview matches what visitors will see.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';

use Amei\Auth;
use Amei\Http;
use Amei\NewsRepository;
use Amei\ProductRepository;
use Amei\Sanitizer;

Auth::requireLogin();

$id = (int) ($_GET['id'] ?? 0);
$article = $id > 0 ? NewsRepository::find($id) : null;
if ($article === null) {
    http_response_code(404);
    echo '記事が見つかりません。';
    exit;
}

// Prefer the auto-saved copy when there is one: that is what the author is
// actually looking at in the editor.
$autosave = NewsRepository::autosaveFor($id);
if ($autosave !== null) {
    $article['title'] = (string) $autosave['title'];
    $article['body'] = (string) $autosave['body'];
    $article['category'] = (string) $autosave['category'];
    $article['published_at'] = $autosave['published_at'];
}

$e = static fn (?string $v): string => Sanitizer::e($v);
$related = null;
if (($article['related_product_id'] ?? '') !== '') {
    $related = ProductRepository::find((string) $article['related_product_id']);
}

/** Formats a stored publication date, tolerating an unset or unparseable one. */
function previewDate(mixed $value): string
{
    if (!is_string($value) || $value === '') {
        return '（公開日未設定）';
    }
    $timestamp = strtotime($value);
    return $timestamp === false ? '（公開日未設定）' : date('Y.m.d', $timestamp);
}

Http::securityHeaders(true);
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');
?>
<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>プレビュー：<?= $e((string) $article['title']) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700&family=Caveat:wght@400..600&display=swap">
<style>
  /* Mirrors the public article styles closely enough to judge the layout. */
  body { margin:0; background:#fffdfa; color:#4a3f3a;
         font-family:-apple-system,'Hiragino Sans','Noto Sans JP',Meiryo,sans-serif;
         font-size:16px; line-height:1.95; }
  .bar { position:sticky; top:0; background:#2f2a27; color:#fff; padding:8px 16px; font-size:13px;
         display:flex; gap:12px; align-items:center; justify-content:space-between; }
  .bar a { color:#f6b7a5; }
  .wrap { max-width:720px; margin:0 auto; padding:32px 20px 80px; }
  h1 { font-family:'Zen Maru Gothic',sans-serif; font-size:1.9rem; line-height:1.5; margin:0 0 12px; }
  .meta { display:flex; gap:12px; align-items:center; color:#a5978f; font-size:.85rem; margin-bottom:24px; }
  .tag { background:#c3ded7; color:#2f5e53; border-radius:999px; padding:2px 12px; font-size:.75rem; font-weight:700; }
  .hero { width:100%; border-radius:20px; margin-bottom:28px; }
  .body > * + * { margin-top:1rem; }
  .body h2 { font-family:'Zen Maru Gothic',sans-serif; font-size:1.35rem; margin-top:2.4rem;
             padding-bottom:.4rem; border-bottom:2px dashed #ddcec0; }
  .body h3 { font-family:'Zen Maru Gothic',sans-serif; font-size:1.15rem; margin-top:2rem; color:#cf6a53; }
  .body a { color:#cf6a53; font-weight:700; }
  .body blockquote { margin:0; padding:1rem 1.25rem; border-left:4px solid #f6b7a5;
                     border-radius:8px; background:#fff7ef; color:#7b6d66; }
  .body strong { background:linear-gradient(transparent 62%, #f2c14e 62%); }
  .related { margin-top:40px; padding:20px; border-radius:18px; background:#fff7ef;
             display:flex; gap:16px; align-items:center; }
  .related img { width:80px; height:80px; object-fit:cover; border-radius:12px; }
</style>
</head>
<body>
<div class="bar">
  <span>プレビュー（管理者のみ表示・公開サイトには反映されていません）<?= $autosave !== null ? '／自動保存の内容を表示中' : '' ?></span>
  <span><a href="/admin/news/edit.php?id=<?= $id ?>">編集に戻る</a></span>
</div>

<article class="wrap">
  <div class="meta">
    <time><?= $e(previewDate($article['published_at'])) ?></time>
    <span class="tag"><?= $e(NewsRepository::categoryLabel((string) $article['category'])) ?></span>
    <span><?= $e(NewsRepository::STATUSES[(string) $article['status']] ?? '') ?></span>
  </div>

  <h1><?= ((string) $article['title']) === '' ? '（無題）' : $e((string) $article['title']) ?></h1>

  <?php if (($article['image_path'] ?? '') !== ''): ?>
    <img class="hero" src="<?= $e((string) $article['image_path']) ?>" alt=""
         width="<?= (int) ($article['image_width'] ?? 1200) ?>"
         height="<?= (int) ($article['image_height'] ?? 800) ?>">
  <?php endif; ?>

  <?php /* Already sanitised against the allow-list before storage. */ ?>
  <div class="body"><?= (string) $article['body'] ?></div>

  <?php if ($related !== null): ?>
    <div class="related">
      <?php $img = ($related['images'][0]['thumb'] ?? '');
            if ($img !== ''): ?>
        <img src="<?= $e((string) $img) ?>" alt="" width="80" height="80">
      <?php endif; ?>
      <div>
        <strong><?= $e((string) $related['name']) ?></strong><br>
        <span>¥<?= number_format((int) $related['price']) ?></span>
      </div>
    </div>
  <?php endif; ?>
</article>
</body>
</html>
