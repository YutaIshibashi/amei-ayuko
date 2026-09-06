<?php

declare(strict_types=1);

namespace Amei;

/**
 * Image intake for admin uploads.
 *
 * Every uploaded file is validated by content (not by name or by the
 * client-supplied MIME type), then fully re-encoded through GD. Re-encoding is
 * the important part: it discards EXIF, any appended payload and any polyglot
 * trickery, so what lands on disk is an image this server produced.
 */
final class ImageService
{
    public const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

    private const ALLOWED = [
        IMAGETYPE_JPEG => 'jpeg',
        IMAGETYPE_PNG  => 'png',
        IMAGETYPE_WEBP => 'webp',
        IMAGETYPE_GIF  => 'gif',
    ];

    /**
     * Processes one uploaded file into a WebP of at most `$maxEdge` pixels.
     *
     * @param array{name?: string, type?: string, tmp_name?: string, error?: int, size?: int} $file
     * @param string $destDir absolute directory
     * @param string $publicPrefix URL prefix matching $destDir
     * @return array{path: string, width: int, height: int}
     */
    public static function storeAsWebp(
        array $file,
        string $destDir,
        string $publicPrefix,
        int $maxEdge,
        int $quality = 82,
    ): array {
        $error = $file['error'] ?? UPLOAD_ERR_NO_FILE;
        if ($error !== UPLOAD_ERR_OK) {
            throw new \RuntimeException(self::uploadErrorMessage((int) $error));
        }

        $tmp = $file['tmp_name'] ?? '';
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new \RuntimeException('アップロードに失敗しました。');
        }
        if (($file['size'] ?? 0) > self::MAX_UPLOAD_BYTES) {
            throw new \RuntimeException('画像サイズが大きすぎます（最大12MB）。');
        }

        $info = @getimagesize($tmp);
        if ($info === false || !isset(self::ALLOWED[$info[2]])) {
            // The declared MIME type is irrelevant; only the bytes count.
            throw new \RuntimeException('画像ファイル（JPEG / PNG / WebP / GIF）を選択してください。');
        }

        [$srcW, $srcH] = [(int) $info[0], (int) $info[1]];
        if ($srcW < 1 || $srcH < 1 || $srcW > 12000 || $srcH > 12000) {
            throw new \RuntimeException('画像の寸法が処理できる範囲を超えています。');
        }

        $source = self::load($tmp, (int) $info[2]);
        try {
            // `resize()` always returns a freshly allocated image, so the
            // source can be released unconditionally.
            $resized = self::resize($source, $srcW, $srcH, $maxEdge);
        } finally {
            imagedestroy($source);
        }

        if (!is_dir($destDir) && !mkdir($destDir, 0755, true) && !is_dir($destDir)) {
            imagedestroy($resized);
            throw new \RuntimeException('保存先ディレクトリを作成できませんでした。');
        }

        // Random name: the original filename never reaches the filesystem, so
        // path traversal and name collisions are both impossible.
        $filename = date('Ymd') . '-' . bin2hex(random_bytes(8)) . '.webp';
        $absolute = rtrim($destDir, '/') . '/' . $filename;

        $ok = imagewebp($resized, $absolute, $quality);
        $width = imagesx($resized);
        $height = imagesy($resized);
        imagedestroy($resized);

        if (!$ok) {
            Logger::error(Logger::CHANNEL_IMAGE, 'WebP encoding failed', ['dest' => basename($absolute)]);
            throw new \RuntimeException('画像の変換に失敗しました。');
        }
        @chmod($absolute, 0644);

        return [
            'path'   => rtrim($publicPrefix, '/') . '/' . $filename,
            'width'  => $width,
            'height' => $height,
        ];
    }

    /**
     * Deletes a previously stored image.
     *
     * Only paths inside the two known upload roots are touched, so a corrupted
     * database value can never point the unlink at something else.
     */
    public static function deletePublicFile(?string $publicPath): void
    {
        if ($publicPath === null || $publicPath === '') {
            return;
        }
        $allowedPrefixes = ['/uploads/news/', '/uploads/main-visual/'];
        $allowed = false;
        foreach ($allowedPrefixes as $prefix) {
            if (str_starts_with($publicPath, $prefix)) {
                $allowed = true;
                break;
            }
        }
        if (!$allowed || str_contains($publicPath, '..')) {
            Logger::warning(Logger::CHANNEL_IMAGE, 'Refused to delete an out-of-scope path');
            return;
        }

        $absolute = WEB_ROOT . $publicPath;
        $real = realpath($absolute);
        $root = realpath(WEB_ROOT . '/uploads');
        if ($real === false || $root === false || !str_starts_with($real, $root)) {
            return;
        }
        @unlink($real);
    }

    private static function load(string $path, int $type): \GdImage
    {
        $image = match ($type) {
            IMAGETYPE_JPEG => @imagecreatefromjpeg($path),
            IMAGETYPE_PNG  => @imagecreatefrompng($path),
            IMAGETYPE_WEBP => @imagecreatefromwebp($path),
            IMAGETYPE_GIF  => @imagecreatefromgif($path),
            default        => false,
        };
        if (!$image instanceof \GdImage) {
            throw new \RuntimeException('画像を読み込めませんでした。');
        }
        return $image;
    }

    private static function resize(\GdImage $source, int $srcW, int $srcH, int $maxEdge): \GdImage
    {
        $longest = max($srcW, $srcH);
        if ($longest <= $maxEdge) {
            // Still re-encode: that is what strips metadata and any payload.
            return self::flatten($source, $srcW, $srcH);
        }

        $scale = $maxEdge / $longest;
        $dstW = max(1, (int) round($srcW * $scale));
        $dstH = max(1, (int) round($srcH * $scale));

        $dst = imagecreatetruecolor($dstW, $dstH);
        self::preserveAlpha($dst);
        imagecopyresampled($dst, $source, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);
        return $dst;
    }

    private static function flatten(\GdImage $source, int $w, int $h): \GdImage
    {
        $dst = imagecreatetruecolor(max(1, $w), max(1, $h));
        self::preserveAlpha($dst);
        imagecopy($dst, $source, 0, 0, 0, 0, $w, $h);
        return $dst;
    }

    private static function preserveAlpha(\GdImage $image): void
    {
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $transparent = imagecolorallocatealpha($image, 0, 0, 0, 127);
        if ($transparent !== false) {
            imagefilledrectangle($image, 0, 0, imagesx($image) - 1, imagesy($image) - 1, $transparent);
        }
        imagealphablending($image, true);
    }

    private static function uploadErrorMessage(int $code): string
    {
        return match ($code) {
            UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => '画像サイズが大きすぎます。',
            UPLOAD_ERR_PARTIAL   => 'アップロードが中断されました。もう一度お試しください。',
            UPLOAD_ERR_NO_FILE   => '画像が選択されていません。',
            UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE => 'サーバー側で画像を保存できませんでした。',
            default              => 'アップロードに失敗しました。',
        };
    }
}
