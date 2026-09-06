<?php

declare(strict_types=1);

namespace Amei;

/**
 * Server-side validation for the contact form.
 *
 * The browser runs the same rules for immediacy, but this is the copy that
 * decides: a request that skips the UI entirely still has to pass here.
 */
final class Validator
{
    public const MAX_NAME = 100;
    public const MAX_MESSAGE = 5000;
    public const MAX_EMAIL = 254;

    /** @var array<string, string> */
    private array $errors = [];

    /** @var array<string, mixed> */
    private array $clean = [];

    /** @param array<string, mixed> $input */
    public function __construct(private readonly array $input)
    {
    }

    public function name(string $key): self
    {
        $value = $this->stringOf($key);
        if ($value === '') {
            $this->errors[$key] = 'お名前をご入力ください。';
        } elseif (mb_strlen($value) > self::MAX_NAME) {
            $this->errors[$key] = 'お名前は' . self::MAX_NAME . '文字以内でご入力ください。';
        } elseif ($this->hasControlChars($value)) {
            $this->errors[$key] = 'お名前に使用できない文字が含まれています。';
        } else {
            $this->clean[$key] = $value;
        }
        return $this;
    }

    public function email(string $key): self
    {
        $value = $this->stringOf($key);
        if ($value === '') {
            $this->errors[$key] = 'メールアドレスをご入力ください。';
        } elseif (mb_strlen($value) > self::MAX_EMAIL) {
            $this->errors[$key] = 'メールアドレスが長すぎます。';
        } elseif (filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            $this->errors[$key] = 'あと少しです♪ メールアドレスの形式をご確認ください。';
        } elseif ($this->hasHeaderInjection($value)) {
            // Belt and braces: PHPMailer rejects these too, but never rely on
            // a downstream library to be the only check.
            $this->errors[$key] = 'メールアドレスに使用できない文字が含まれています。';
        } else {
            $this->clean[$key] = $value;
        }
        return $this;
    }

    public function matches(string $key, string $otherKey, string $message): self
    {
        $value = $this->stringOf($key);
        if ($value === '') {
            $this->errors[$key] = '確認のため、もう一度ご入力ください。';
        } elseif ($value !== $this->stringOf($otherKey)) {
            $this->errors[$key] = $message;
        } else {
            $this->clean[$key] = $value;
        }
        return $this;
    }

    public function message(string $key): self
    {
        $value = $this->stringOf($key);
        if ($value === '') {
            $this->errors[$key] = 'お問い合わせ内容をご入力ください。';
        } elseif (mb_strlen($value) > self::MAX_MESSAGE) {
            $this->errors[$key] = 'お問い合わせ内容は' . self::MAX_MESSAGE . '文字以内でご入力ください。';
        } else {
            // Normalise line endings; keep the text otherwise verbatim.
            $this->clean[$key] = str_replace(["\r\n", "\r"], "\n", $value);
        }
        return $this;
    }

    /** @param list<int> $allowedIds */
    public function choice(string $key, array $allowedIds): self
    {
        $raw = $this->input[$key] ?? null;
        $id = is_numeric($raw) ? (int) $raw : 0;
        if (!in_array($id, $allowedIds, true)) {
            $this->errors[$key] = 'お問い合わせの種別をお選びください。';
        } else {
            $this->clean[$key] = $id;
        }
        return $this;
    }

    public function accepted(string $key, string $message): self
    {
        $value = $this->input[$key] ?? false;
        if ($value !== true && $value !== 'true' && $value !== '1' && $value !== 1 && $value !== 'on') {
            $this->errors[$key] = $message;
        } else {
            $this->clean[$key] = true;
        }
        return $this;
    }

    public function fails(): bool
    {
        return $this->errors !== [];
    }

    /** @return array<string, string> */
    public function errors(): array
    {
        return $this->errors;
    }

    public function string(string $key): string
    {
        $value = $this->clean[$key] ?? '';
        return is_string($value) ? $value : '';
    }

    public function int(string $key): int
    {
        $value = $this->clean[$key] ?? 0;
        return is_int($value) ? $value : 0;
    }

    private function stringOf(string $key): string
    {
        $value = $this->input[$key] ?? '';
        if (!is_string($value)) {
            return '';
        }
        // Strip invalid UTF-8 before anything else looks at the value.
        $value = mb_scrub($value, 'UTF-8');
        return trim($value);
    }

    private function hasControlChars(string $value): bool
    {
        return preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1;
    }

    private function hasHeaderInjection(string $value): bool
    {
        return preg_match('/[\r\n\t]|%0a|%0d/i', $value) === 1;
    }
}
