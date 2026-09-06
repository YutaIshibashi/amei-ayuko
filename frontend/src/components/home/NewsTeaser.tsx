'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchNewsList } from '@/lib/api';
import { formatDate, toIsoJst } from '@/lib/format';
import { TOP_NEWS_COUNT } from '@/lib/site';
import type { NewsItem } from '@/lib/types';
import Reveal from '../Reveal';
import { IconArrowRight } from '../Icons';

/**
 * Latest five articles — date and title only.
 *
 * News is editable at runtime, so it is fetched client-side; the section keeps
 * a fixed-height skeleton while loading and removes itself entirely if there
 * is nothing to show, rather than rendering an empty box.
 */
export default function NewsTeaser() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchNewsList(1, ac.signal)
      .then((res) => setItems(res.items.slice(0, TOP_NEWS_COUNT)))
      .catch(() => { if (!ac.signal.aborted) setFailed(true); });
    return () => ac.abort();
  }, []);

  if (failed || (items && items.length === 0)) return null;

  return (
    <section className="l-section l-section--mint" aria-labelledby="news-title">
      <div className="l-page">
        <Reveal className="c-secHead">
          <span className="c-secHead__en a-enTitle">News</span>
          <h2 className="c-secHead__jp" id="news-title">お知らせ</h2>
        </Reveal>

        <Reveal delay={80} style={{ maxWidth: 'var(--w-text)', marginInline: 'auto' }}>
          {items === null ? (
            <ul className="c-newsMini" aria-busy="true" aria-live="polite">
              {Array.from({ length: TOP_NEWS_COUNT }).map((_, i) => (
                <li className="c-newsMini__item" key={i}>
                  <span className="c-newsMini__link" style={{ display: 'block' }}>
                    <span className="c-skeleton" style={{ display: 'block', height: '1.2em', width: '60%' }} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="c-newsMini">
              {items.map((item) => (
                <li className="c-newsMini__item" key={item.id}>
                  <Link className="c-newsMini__link" href={`/news/${item.id}`}>
                    <time className="a-date" dateTime={toIsoJst(item.publishedAt)}>
                      {formatDate(item.publishedAt)}
                    </time>
                    <span className="c-newsMini__title">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div style={{ textAlign: 'center', marginTop: 'var(--s-6)' }}>
            <Link href="/news/" className="a-btn a-btn--ghost">
              もっと見る
              <IconArrowRight width={18} height={18} />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
