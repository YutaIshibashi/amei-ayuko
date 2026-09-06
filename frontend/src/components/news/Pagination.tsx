'use client';

import Link from 'next/link';
import { IconArrowLeft, IconArrowRight } from '../Icons';

/**
 * Numbered pagination.
 *
 * Renders real `<Link>`s (crawlable, middle-clickable) rather than buttons,
 * and collapses long ranges to first / neighbours / last.
 */
export default function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const pages = pageRange(page, totalPages);

  return (
    <nav className="c-pager" aria-label="ページ送り">
      <Link
        className={`c-pager__link ${page <= 1 ? 'is-disabled' : ''}`}
        href={hrefFor(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        tabIndex={page <= 1 ? -1 : undefined}
      >
        <IconArrowLeft width={16} height={16} />
        <span className="a-visuallyHidden">前のページ</span>
      </Link>

      {pages.map((p, i) =>
        p === null ? (
          <span className="c-pager__gap" key={`gap-${i}`} aria-hidden="true">…</span>
        ) : (
          <Link
            key={p}
            className="c-pager__link"
            href={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`${p}ページ目`}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        className={`c-pager__link ${page >= totalPages ? 'is-disabled' : ''}`}
        href={hrefFor(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        tabIndex={page >= totalPages ? -1 : undefined}
      >
        <IconArrowRight width={16} height={16} />
        <span className="a-visuallyHidden">次のページ</span>
      </Link>
    </nav>
  );
}

/** `1 … 4 5 6 … 12` — `null` marks an ellipsis. */
function pageRange(current: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | null)[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push(null);
  for (let p = from; p <= to; p += 1) out.push(p);
  if (to < total - 1) out.push(null);
  out.push(total);
  return out;
}
