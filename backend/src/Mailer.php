<?php

declare(strict_types=1);

namespace Amei;

use PHPMailer\PHPMailer\Exception as MailException;
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;

/**
 * Outgoing mail.
 *
 * Always SMTP through PHPMailer — `mail()` is not used, because on shared
 * hosting it produces envelopes that land in spam and offers no way to detect
 * a delivery failure. Every message is UTF-8 multipart (HTML + plain text).
 */
final class Mailer
{
    /**
     * @param list<array{name: string, email: string}> $replyTo
     */
    public static function send(
        string $toEmail,
        string $toName,
        string $subject,
        string $html,
        string $text,
        array $replyTo = [],
    ): bool {
        $mailer = new PHPMailer(true);

        try {
            $mailer->isSMTP();
            $mailer->Host       = Config::require('SMTP_HOST');
            $mailer->Port       = Config::int('SMTP_PORT', 587);
            $mailer->SMTPAuth   = true;
            $mailer->Username   = Config::require('SMTP_USER');
            $mailer->Password   = Config::require('SMTP_PASSWORD');
            $mailer->SMTPSecure = $mailer->Port === 465
                ? PHPMailer::ENCRYPTION_SMTPS
                : PHPMailer::ENCRYPTION_STARTTLS;
            $mailer->SMTPDebug  = SMTP::DEBUG_OFF;
            $mailer->Timeout    = 20;

            $mailer->CharSet  = PHPMailer::CHARSET_UTF8;
            $mailer->Encoding = PHPMailer::ENCODING_BASE64;

            $fromEmail = Config::get('MAIL_FROM_EMAIL', Config::get('SMTP_USER')) ?? '';
            $fromName  = Config::get('MAIL_FROM_NAME', 'amei ayuko') ?? 'amei ayuko';
            $mailer->setFrom($fromEmail, $fromName);

            $mailer->addAddress($toEmail, $toName);
            foreach ($replyTo as $reply) {
                $mailer->addReplyTo($reply['email'], $reply['name']);
            }

            // PHPMailer validates addresses and rejects header injection, but
            // the values reaching it were already validated in Validator.
            $mailer->Subject = $subject;
            $mailer->isHTML(true);
            $mailer->Body    = $html;
            $mailer->AltBody = $text;

            $mailer->send();
            return true;
        } catch (MailException $e) {
            // ErrorInfo can contain the SMTP dialogue; the password is never
            // part of it, but keep the message short regardless.
            Logger::error(Logger::CHANNEL_CONTACT, 'Mail send failed', [
                'smtp_error' => mb_substr($mailer->ErrorInfo, 0, 200),
            ]);
            return false;
        } catch (\Throwable $e) {
            Logger::error(Logger::CHANNEL_CONTACT, 'Mail send failed (unexpected)', [
                'exception' => get_class($e),
            ]);
            return false;
        }
    }

    /**
     * Renders one of the templates in `templates/mail/`.
     *
     * @param array<string, string> $vars
     */
    public static function render(string $template, array $vars): string
    {
        $path = APP_DIR . '/templates/mail/' . basename($template);
        if (!is_readable($path)) {
            throw new \RuntimeException("Mail template not found: {$template}");
        }
        $body = (string) file_get_contents($path);
        foreach ($vars as $key => $value) {
            $body = str_replace('{{' . $key . '}}', $value, $body);
        }
        // Any placeholder the caller forgot is removed rather than shipped.
        return preg_replace('/\{\{[a-z_]+\}\}/i', '', $body) ?? $body;
    }

    /** Escapes a value for inclusion in an HTML mail body. */
    public static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** Preserves the author's line breaks inside an HTML mail. */
    public static function nl2brEscaped(string $value): string
    {
        return nl2br(self::e($value), false);
    }

    /** Sends an operational alert to the administrator. */
    public static function notifyAdmin(string $subject, string $text): bool
    {
        $to = Settings::get('contact_admin_email', Config::get('ADMIN_EMAIL', '') ?? '');
        if ($to === '') {
            Logger::error(Logger::CHANNEL_APP, 'Admin notification skipped: no address configured');
            return false;
        }
        $html = '<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;'
            . 'font-size:13px;line-height:1.8;color:#4a3f3a">' . self::e($text) . '</pre>';
        return self::send($to, 'amei ayuko 管理者', $subject, $html, $text);
    }
}
