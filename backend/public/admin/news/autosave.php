<?php

declare(strict_types=1);

/**
 * POST /admin/news/autosave.php
 *
 * The 30-second auto-save. Writes to `news_autosaves` only — never to the row
 * the public site reads — so an in-progress edit of a live article cannot go
 * out before the author presses 更新.
 *
 * Image and related-product changes are deliberately *not* auto-saved: both
 * involve side effects (file writes, deletions) that should only happen on an
 * explicit action.
 */

require_once dirname(__DIR__, 2) . '/_app/bootstrap.php';

use Amei\Auth;
use Amei\Csrf;
use Amei\Http;
use Amei\NewsRepository;
use Amei\Sanitizer;
use Amei\Session;

Http::requireMethod('POST');
Session::start();

if (!Auth::check()) {
    Http::error('unauthorized', 'ログインが必要です。', 401);
}

$body = Http::jsonBody(1_000_000);

if (!Csrf::verify(is_string($body['csrfToken'] ?? null) ? $body['csrfToken'] : null)) {
    Http::error('invalid_token', 'セッションの有効期限が切れました。', 419);
}

$id = (int) ($body['id'] ?? 0);
if ($id <= 0 || NewsRepository::find($id) === null) {
    Http::error('not_found', '記事が見つかりません。', 404);
}

$publishedAtRaw = trim((string) ($body['publishedAt'] ?? ''));
$publishedAt = null;
if ($publishedAtRaw !== '') {
    $timestamp = strtotime(str_replace('T', ' ', $publishedAtRaw));
    $publishedAt = $timestamp === false ? null : date('Y-m-d H:i:s', $timestamp);
}

$category = (string) ($body['category'] ?? 'info');
if (!isset(NewsRepository::CATEGORIES[$category])) {
    $category = 'info';
}

NewsRepository::autosave(
    $id,
    mb_substr(trim((string) ($body['title'] ?? '')), 0, 255),
    // Sanitised here too: the auto-saved copy can be restored into the editor,
    // and anything stored must already be safe.
    Sanitizer::html((string) ($body['body'] ?? '')),
    $category,
    $publishedAt,
);

Http::json(['ok' => true, 'savedAt' => date('H:i:s')], 200);
