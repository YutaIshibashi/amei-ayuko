<?php

declare(strict_types=1);

/**
 * POST /api/contact.php
 *
 * The enquiry endpoint. Order of checks matters: the cheap, local rejections
 * (method, JSON shape, honeypot, CSRF, rate limit) run before the network call
 * to Turnstile, so a flood costs almost nothing.
 *
 * Nothing the visitor typed is written to the database. The body travels by
 * mail only; the throttle table holds hashes.
 */

require_once dirname(__DIR__) . '/_app/bootstrap.php';

use Amei\Config;
use Amei\Csrf;
use Amei\Database;
use Amei\Http;
use Amei\Logger;
use Amei\Mailer;
use Amei\Maintenance;
use Amei\RateLimiter;
use Amei\Settings;
use Amei\Turnstile;
use Amei\Validator;

Http::requireMethod('POST');
Maintenance::blockApi();

$body = Http::jsonBody(64_000);

/* --- 1. Honeypot ---------------------------------------------------------
   A hidden field a person never sees. Answer 200 so a bot cannot use the
   response to learn that it was detected. */
if (trim((string) ($body['website'] ?? '')) !== '') {
    Logger::info(Logger::CHANNEL_CONTACT, 'Honeypot triggered');
    Http::json(['ok' => true], 200);
}

/* --- 2. CSRF ------------------------------------------------------------- */
if (!Csrf::verify(is_string($body['csrfToken'] ?? null) ? $body['csrfToken'] : null)) {
    Http::error(
        'invalid_token',
        'セッションの有効期限が切れました。ページを再読み込みして、もう一度お試しください。',
        419
    );
}

/* --- 3. Rate limit ------------------------------------------------------- */
$ipHash = Http::ipHash();
if (RateLimiter::tooSoon($ipHash)) {
    Http::error(
        'rate_limited',
        '短時間に複数回送信されています。少し時間をおいてからお試しください。',
        429
    );
}

/* --- 4. Validation ------------------------------------------------------- */
$allowedTypeIds = array_map(
    static fn (array $row): int => (int) $row['id'],
    Database::all('SELECT id FROM contact_types WHERE is_active = 1')
);

$validator = (new Validator($body))
    ->name('name')
    ->email('email')
    ->matches('emailConfirm', 'email', 'メールアドレスが一致していません。もう一度ご確認ください。')
    ->choice('contactTypeId', $allowedTypeIds)
    ->message('message')
    ->accepted('agree', 'プライバシーポリシーへの同意が必要です。');

if ($validator->fails()) {
    Http::error('validation_failed', '入力内容をご確認ください。', 422, $validator->errors());
}

$name = $validator->string('name');
$email = $validator->string('email');
$message = $validator->string('message');
$typeId = $validator->int('contactTypeId');

/* --- 5. Duplicate guard --------------------------------------------------
   Covers the double-tap and the "I never saw the response, let me resend"
   case; the client-side disable is only the first half of that job. */
$fingerprint = RateLimiter::fingerprint($email, $message);
if (RateLimiter::isDuplicate($fingerprint)) {
    Logger::info(Logger::CHANNEL_CONTACT, 'Duplicate submission suppressed');
    Http::json(['ok' => true], 200);
}

/* --- 6. Turnstile -------------------------------------------------------- */
$token = is_string($body['turnstileToken'] ?? null) ? $body['turnstileToken'] : '';
if (!Turnstile::verify($token, Http::clientIp())) {
    Http::error(
        'captcha_failed',
        'スパム対策の確認に失敗しました。ページを再読み込みして、もう一度お試しください。',
        400
    );
}

/* --- 7. Deliver ---------------------------------------------------------- */
$typeRow = Database::one('SELECT label FROM contact_types WHERE id = :id', [':id' => $typeId]);
$typeLabel = is_array($typeRow) ? (string) $typeRow['label'] : 'お問い合わせ';

$settings = Settings::all();
$adminEmail = $settings['contact_admin_email'] ?? '';
if ($adminEmail === '') {
    $adminEmail = Config::get('ADMIN_EMAIL', '') ?? '';
}
if ($adminEmail === '') {
    Logger::error(Logger::CHANNEL_CONTACT, 'No administrator address configured; cannot deliver');
    Http::error('mail_failed', '送信できませんでした。時間をおいて再度お試しください。', 500);
}

$siteUrl = Config::siteUrl();
$common = [
    'name'          => $name,
    'contact_type'  => $typeLabel,
    'message'       => $message,
    'site_url'      => $siteUrl,
    'shop_url'      => $siteUrl . '/shop/',
    'instagram_url' => $settings['instagram_url'] ?? 'https://www.instagram.com/amei_ayuko/',
    'copyright'     => $settings['copyright'] ?? '© amei ayuko',
];

/* 7a. Administrator notification. Reply-To is the enquirer, so replying from
   the mail client goes straight back to them. */
$adminText = Mailer::render('admin-notify.txt', $common + [
    'received_at' => date('Y-m-d H:i:s'),
    'ip_hash'     => substr($ipHash, 0, 12),
    'email'       => $email,
]);

$adminSent = Mailer::send(
    $adminEmail,
    'amei ayuko 管理者',
    '【お問い合わせ】' . $typeLabel . '／' . mb_substr($name, 0, 40) . ' 様',
    '<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;'
        . 'font-size:13px;line-height:1.85;color:#4a3f3a">' . Mailer::e($adminText) . '</pre>',
    $adminText,
    [['name' => $name, 'email' => $email]],
);

if (!$adminSent) {
    // Do not record the submission: the visitor should be able to retry.
    Http::error(
        'mail_failed',
        '送信できませんでした。お手数ですが、時間をおいて再度お試しください。',
        502
    );
}

/* 7b. Auto-reply. A failure here must not tell the visitor their enquiry was
   lost — it was not; the administrator already has it. */
$subject = $settings['contact_reply_subject'] ?? '【amei ayuko】お問い合わせありがとうございます';
$intro = $settings['contact_reply_body']
    ?? "この度はお問い合わせいただき、ありがとうございます。\n以下の内容で承りました。";

// The HTML template interpolates raw strings, so every visitor-supplied
// value is escaped here before substitution; the plain-text part is not.
$replyHtml = Mailer::render('auto-reply.html', [
    'subject'       => Mailer::e($subject),
    'preheader'     => 'お問い合わせを受け付けました。2〜3営業日以内にご返信いたします。',
    'intro'         => Mailer::nl2brEscaped($intro),
    'logo_url'      => Mailer::e($siteUrl . '/brand/logo.svg'),
    'name'          => Mailer::e($name),
    'contact_type'  => Mailer::e($typeLabel),
    'message'       => Mailer::nl2brEscaped($message),
    'site_url'      => Mailer::e($siteUrl),
    'shop_url'      => Mailer::e($common['shop_url']),
    'instagram_url' => Mailer::e($common['instagram_url']),
    'copyright'     => Mailer::e($common['copyright']),
]);

$replyText = Mailer::render('auto-reply.txt', $common + ['intro' => $intro]);

if (!Mailer::send($email, $name, $subject, $replyHtml, $replyText)) {
    Logger::warning(Logger::CHANNEL_CONTACT, 'Auto-reply failed; the enquiry itself was delivered');
}

RateLimiter::record($ipHash, $fingerprint);
Logger::info(Logger::CHANNEL_CONTACT, 'Enquiry delivered', ['contact_type' => $typeLabel]);

Http::json(['ok' => true], 200);
