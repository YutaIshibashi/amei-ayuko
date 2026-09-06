<?php

declare(strict_types=1);

namespace Amei;

/**
 * Cloudflare Turnstile verification.
 *
 * The secret key never leaves the server; the browser only ever holds the site
 * key and the short-lived response token.
 */
final class Turnstile
{
    private const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    public static function verify(string $token, string $remoteIp): bool
    {
        $secret = Config::get('TURNSTILE_SECRET_KEY', '');
        if ($secret === null || $secret === '') {
            // Refuse rather than silently accepting everything: an
            // unconfigured captcha is a spam funnel.
            Logger::error(Logger::CHANNEL_CONTACT, 'Turnstile secret is not configured');
            return false;
        }
        if ($token === '') {
            return false;
        }

        $payload = http_build_query([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $remoteIp,
        ]);

        $ch = curl_init(self::ENDPOINT);
        if ($ch === false) {
            Logger::error(Logger::CHANNEL_CONTACT, 'Turnstile: curl init failed');
            return false;
        }

        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if (!is_string($body) || $status !== 200) {
            Logger::error(Logger::CHANNEL_CONTACT, 'Turnstile verification request failed', [
                'status' => $status,
                'curl'   => $curlError,
            ]);
            return false;
        }

        $data = json_decode($body, true);
        if (!is_array($data)) {
            return false;
        }

        $success = ($data['success'] ?? false) === true;
        if (!$success) {
            Logger::warning(Logger::CHANNEL_CONTACT, 'Turnstile rejected a submission', [
                'codes' => $data['error-codes'] ?? [],
            ]);
        }
        return $success;
    }
}
