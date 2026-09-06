<?php

declare(strict_types=1);

namespace Amei;

/**
 * Automatic product categorisation.
 *
 * The two categories are fixed, so this is a keyword classifier over the minne
 * title and description rather than anything cleverer. Products it cannot
 * place are deliberately *not* guessed into a category: they are withheld from
 * the public site and surfaced in the admin screen for a human decision.
 */
final class Categorizer
{
    /** Weighted keywords. Title matches count double (see classify()). */
    private const RULES = [
        'stamp' => [
            'スタンプ'        => 6,
            'ラバースタンプ'  => 10,
            'はんこ'          => 6,
            'ハンコ'          => 6,
            '判子'            => 5,
            '消しゴムはんこ'  => 8,
            'stamp'           => 6,
            'ゴム印'          => 5,
            'スタンプ台'      => 3,
            '浸透印'          => 4,
        ],
        'album-flake' => [
            'フレーク'        => 8,
            'アルバムフレーク' => 10,
            'フレークシール'  => 9,
            'シール'          => 4,
            'アルバム'        => 6,
            'アルバムクラフト' => 8,
            '成長記録'        => 5,
            '月齢カード'      => 6,
            'マンスリーカード' => 6,
            'ダイカット'      => 4,
            'メモリアル'      => 3,
            'flake'           => 7,
            'ペーパー'        => 3,
        ],
    ];

    private const MIN_SCORE = 5;

    /**
     * @param array<string, string> $overrides product_id => category
     * @return string|null the category slug, or null when undecidable
     */
    public static function classify(string $id, string $title, string $description, array $overrides = []): ?string
    {
        // A manual assignment always wins, and is never re-evaluated.
        if (isset($overrides[$id]) && isset(ProductRepository::CATEGORIES[$overrides[$id]])) {
            return $overrides[$id];
        }

        $title = self::normalise($title);
        $description = self::normalise(mb_substr($description, 0, 1500));

        $scores = [];
        foreach (self::RULES as $category => $keywords) {
            $score = 0;
            foreach ($keywords as $keyword => $weight) {
                $needle = self::normalise((string) $keyword);
                if ($needle === '') {
                    continue;
                }
                if (str_contains($title, $needle)) {
                    $score += $weight * 2; // the title is the stronger signal
                }
                if (str_contains($description, $needle)) {
                    $score += $weight;
                }
            }
            $scores[$category] = $score;
        }

        arsort($scores);
        $best = array_key_first($scores);
        if ($best === null) {
            return null;
        }
        $bestScore = $scores[$best];
        $rest = array_values($scores);
        $secondScore = $rest[1] ?? 0;

        if ($bestScore < self::MIN_SCORE) {
            return null; // nothing matched strongly enough
        }
        if ($bestScore === $secondScore) {
            return null; // genuinely ambiguous — ask a human
        }

        return (string) $best;
    }

    private static function normalise(string $value): string
    {
        // Fold width and case so 「スタンプ」/「ｽﾀﾝﾌﾟ」/「STAMP」 all match.
        $value = mb_convert_kana($value, 'asKV', 'UTF-8');
        return mb_strtolower($value, 'UTF-8');
    }
}
