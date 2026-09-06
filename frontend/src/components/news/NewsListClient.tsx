'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchNewsList } from '@/lib/api';
import { formatDate, toIsoJst } from '@/lib/format';
import { newsCategoryLabel, NEWS_PER_PAGE } from '@/lib/site';
import type { NewsListResponse } from '@/lib/types';
import Pagination from './Pagination';

/**
 * News index.
 *
 * Articles live in MySQL and are editable at any time, so the list is fetched
 * rather than baked into the export. The page number is a query parameter so
 * a single static shell serves every page.
 */
export default function NewsListClient() {
  const searchParams = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  // The page number is stored alongside the result, so a response that belongs
  // to a previous page is simply ignored on render. That removes the need to
  // blank the state from inside the effect when the page changes.
  const [result, setResult] = useState<
    { page: number; data: NewsListResponse | null; failed: boolean } | null
  >(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchNewsList(page, ac.signal)
      .then((data) => setResult({ page, data, failed: false }))
      .catch(() => {
        if (!ac.signal.aborted) setResult({ page, data: null, failed: true });
      });
    return () => ac.abort();
  }, [page]);

  const current = result?.page === page ? result : null;
  const data = current?.data ?? null;
  const failed = current?.failed ?? false;

  return (
    <section className="l-section l-section--paper" style={{ paddingTop: 'var(--s-5)' }}>
      <div className="l-page">
        <div className="c-pageHead">
          <span className="c-pageHead__en">News</span>
          <h1 className="c-pageHead__jp">お知らせ</h1>
          <p className="c-pageHead__note">新商品やイベント出店のご案内をお届けします。</p>
        </div>

        <div style={{ maxWidth: '860px', marginInline: 'auto' }}>
          {failed ? (
            <div className="c-empty">
              <p>お知らせを読み込めませんでした。時間をおいて再度お試しください。</p>
            </div>
          ) : data === null ? (
            <ul className="c-newsList" aria-busy="true">
              {Array.from({ length: NEWS_PER_PAGE }).map((_, i) => (
                <li key={i} className="c-skeleton" style={{ height: 110 }} />
              ))}
            </ul>
          ) : data.items.length === 0 ? (
            <div className="c-empty">
              <p>まだお知らせはありません。</p>
            </div>
          ) : (
            <>
              <ul className="c-newsList">
                {data.items.map((item) => (
                  <li className="c-newsItem" key={item.id}>
                    <Link
                      className={`c-newsItem__link ${item.image ? '' : 'c-newsItem__link--noimg'}`}
                      href={`/news/${item.id}`}
                    >
                      {/* No placeholder thumbnail: image-less articles just use
                          the full width. */}
                      {item.image ? (
                        <span className="a-ratio a-ratio--1x1 c-newsItem__thumb">
                          <img
                            src={item.image.url}
                            alt=""
                            width={item.image.width}
                            height={item.image.height}
                            loading="lazy"
                            decoding="async"
                          />
                        </span>
                      ) : null}
                      <span>
                        <span className="c-newsItem__meta">
                          <time className="a-date" dateTime={toIsoJst(item.publishedAt)}>
                            {formatDate(item.publishedAt)}
                          </time>
                          <span className="a-tag">{newsCategoryLabel(item.category)}</span>
                        </span>
                        <span className="c-newsItem__title">{item.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <Pagination
                page={data.page}
                totalPages={data.totalPages}
                hrefFor={(p) => (p === 1 ? '/news/' : `/news/?page=${p}`)}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
