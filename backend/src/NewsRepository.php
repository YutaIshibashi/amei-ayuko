<?php

declare(strict_types=1);

namespace Amei;

/**
 * News storage and queries.
 *
 * Publication is a pure condition on the row — `status = 'published'` (or
 * 'scheduled') with `published_at <= NOW()` — so a scheduled article goes live
 * on its own, with no cron job to install or forget.
 */
final class NewsRepository
{
    public const PER_PAGE = 10;

    public const CATEGORIES = [
        'new-product' => '新商品',
        'event'       => 'イベント',
        'info'        => 'お知らせ',
        'other'       => 'その他',
    ];

    public const STATUSES = [
        'draft'     => '下書き',
        'scheduled' => '予約公開',
        'published' => '公開',
        'private'   => '非公開',
    ];

    /** The single definition of "visible to the public". */
    private const PUBLIC_CONDITION = "deleted_at IS NULL
        AND status IN ('published', 'scheduled')
        AND published_at IS NOT NULL
        AND published_at <= NOW()";

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public static function publicList(int $page, int $perPage = self::PER_PAGE): array
    {
        $page = max(1, $page);
        $offset = ($page - 1) * $perPage;

        $total = (int) Database::value(
            'SELECT COUNT(*) FROM news WHERE ' . self::PUBLIC_CONDITION
        );

        $rows = Database::all(
            'SELECT id, title, body, category, published_at, content_updated_at,
                    image_path, image_width, image_height
             FROM news
             WHERE ' . self::PUBLIC_CONDITION . '
             ORDER BY published_at DESC, id DESC
             LIMIT :limit OFFSET :offset',
            [':limit' => $perPage, ':offset' => $offset]
        );

        return ['items' => $rows, 'total' => $total];
    }

    /** @return array<string, mixed>|null */
    public static function publicFind(int $id): ?array
    {
        return Database::one(
            'SELECT id, title, body, category, published_at, content_updated_at,
                    image_path, image_width, image_height, related_product_id
             FROM news
             WHERE id = :id AND ' . self::PUBLIC_CONDITION . '
             LIMIT 1',
            [':id' => $id]
        );
    }

    /** Admin view: any status, including drafts, but not deleted rows. */
    public static function find(int $id, bool $includeDeleted = false): ?array
    {
        $sql = 'SELECT * FROM news WHERE id = :id';
        if (!$includeDeleted) {
            $sql .= ' AND deleted_at IS NULL';
        }
        return Database::one($sql . ' LIMIT 1', [':id' => $id]);
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int}
     */
    public static function adminList(
        int $page,
        string $search = '',
        string $status = '',
        string $category = '',
        bool $deleted = false,
    ): array {
        $where = [$deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'];
        $params = [];

        if ($search !== '') {
            $where[] = 'title LIKE :search';
            // Escape LIKE wildcards so a literal % in a title still matches.
            $params[':search'] = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $search) . '%';
        }
        if ($status !== '' && isset(self::STATUSES[$status])) {
            $where[] = 'status = :status';
            $params[':status'] = $status;
        }
        if ($category !== '' && isset(self::CATEGORIES[$category])) {
            $where[] = 'category = :category';
            $params[':category'] = $category;
        }

        $whereSql = implode(' AND ', $where);
        $total = (int) Database::value("SELECT COUNT(*) FROM news WHERE {$whereSql}", $params);

        $offset = (max(1, $page) - 1) * self::PER_PAGE;
        $rows = Database::all(
            "SELECT id, title, category, status, published_at, image_path, deleted_at
             FROM news WHERE {$whereSql}
             ORDER BY published_at DESC, id DESC
             LIMIT :limit OFFSET :offset",
            $params + [':limit' => self::PER_PAGE, ':offset' => $offset]
        );

        return ['items' => $rows, 'total' => $total];
    }

    /** Creates the empty draft that the editor then works against. */
    public static function createDraft(): int
    {
        Database::run(
            "INSERT INTO news (title, body, category, status) VALUES ('', '', 'info', 'draft')"
        );
        $id = Database::lastInsertId();
        AuditLog::write('news_create', (string) $id);
        return $id;
    }

    /**
     * Explicit save from the editor's "更新" button — the only path that can
     * change what the public sees.
     *
     * @param array{title: string, body: string, category: string, status: string,
     *              published_at: ?string, related_product_id: ?string} $data
     */
    public static function update(int $id, array $data): void
    {
        $current = self::find($id);
        if ($current === null) {
            throw new \RuntimeException('news_not_found');
        }

        $wasPublic = self::isPublicRow($current);
        $contentChanged = $current['title'] !== $data['title'] || $current['body'] !== $data['body'];

        Database::run(
            'UPDATE news
             SET title = :title,
                 body = :body,
                 category = :category,
                 status = :status,
                 published_at = :published_at,
                 related_product_id = :related_product_id,
                 content_updated_at = CASE WHEN :touch = 1 THEN NOW() ELSE content_updated_at END
             WHERE id = :id',
            [
                ':title'              => $data['title'],
                ':body'               => $data['body'],
                ':category'           => $data['category'],
                ':status'             => $data['status'],
                ':published_at'       => $data['published_at'],
                ':related_product_id' => $data['related_product_id'],
                // The visible "更新" date only appears when an already-public
                // article's content actually changed.
                ':touch'              => ($wasPublic && $contentChanged) ? 1 : 0,
                ':id'                 => $id,
            ]
        );

        // The draft copy has been folded in; drop it so the next edit starts clean.
        Database::run('DELETE FROM news_autosaves WHERE news_id = :id', [':id' => $id]);
        AuditLog::write('news_update', (string) $id);
    }

    /**
     * 30-second auto-save. Writes to a side table only — never to the row the
     * public reads.
     */
    public static function autosave(int $id, string $title, string $body, string $category, ?string $publishedAt): void
    {
        Database::run(
            'INSERT INTO news_autosaves (news_id, title, body, category, published_at)
             VALUES (:id, :title, :body, :category, :published_at)
             ON DUPLICATE KEY UPDATE
               title = VALUES(title), body = VALUES(body),
               category = VALUES(category), published_at = VALUES(published_at)',
            [
                ':id'           => $id,
                ':title'        => $title,
                ':body'         => $body,
                ':category'     => $category,
                ':published_at' => $publishedAt,
            ]
        );
    }

    public static function autosaveFor(int $id): ?array
    {
        return Database::one('SELECT * FROM news_autosaves WHERE news_id = :id', [':id' => $id]);
    }

    public static function setStatus(int $id, string $status): void
    {
        if (!isset(self::STATUSES[$status])) {
            throw new \InvalidArgumentException('invalid_status');
        }
        // Publishing something that never had a date gets one now.
        Database::run(
            'UPDATE news
             SET status = :status,
                 published_at = CASE
                   WHEN :status2 = \'published\' AND published_at IS NULL THEN NOW()
                   ELSE published_at END
             WHERE id = :id AND deleted_at IS NULL',
            [':status' => $status, ':status2' => $status, ':id' => $id]
        );
        AuditLog::write($status === 'published' ? 'news_publish' : 'news_unpublish', (string) $id);
    }

    /** Soft delete — recoverable from the deleted list. */
    public static function delete(int $id): void
    {
        Database::run('UPDATE news SET deleted_at = NOW() WHERE id = :id', [':id' => $id]);
        AuditLog::write('news_delete', (string) $id);
    }

    public static function restore(int $id): void
    {
        Database::run('UPDATE news SET deleted_at = NULL WHERE id = :id', [':id' => $id]);
        AuditLog::write('news_restore', (string) $id);
    }

    /** @param array{path: string, width: int, height: int}|null $image */
    public static function setImage(int $id, ?array $image): ?string
    {
        $current = self::find($id);
        $previous = is_array($current) && is_string($current['image_path'] ?? null)
            ? (string) $current['image_path']
            : null;

        Database::run(
            'UPDATE news SET image_path = :p, image_width = :w, image_height = :h WHERE id = :id',
            [
                ':p'  => $image['path'] ?? null,
                ':w'  => $image['width'] ?? null,
                ':h'  => $image['height'] ?? null,
                ':id' => $id,
            ]
        );

        // Caller deletes the old file only after this returns, so a failed
        // switch never leaves the article without an image.
        return $previous;
    }

    /** Articles pointing at a product that no longer exists. */
    public static function withMissingRelatedProduct(): array
    {
        $ids = ProductRepository::allIds();
        $rows = Database::all(
            "SELECT id, title, related_product_id FROM news
             WHERE deleted_at IS NULL AND related_product_id IS NOT NULL AND related_product_id <> ''"
        );
        return array_values(array_filter(
            $rows,
            static fn (array $row): bool => !in_array((string) $row['related_product_id'], $ids, true)
        ));
    }

    public static function categoryLabel(string $slug): string
    {
        return self::CATEGORIES[$slug] ?? 'お知らせ';
    }

    private static function isPublicRow(array $row): bool
    {
        $status = (string) ($row['status'] ?? '');
        $publishedAt = $row['published_at'] ?? null;
        if (!in_array($status, ['published', 'scheduled'], true) || !is_string($publishedAt)) {
            return false;
        }
        return strtotime($publishedAt) <= time();
    }
}
