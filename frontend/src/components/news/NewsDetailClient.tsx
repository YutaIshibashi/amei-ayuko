'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { fetchNewsDetail } from '@/lib/api';
import { track } from '@/lib/analytics';
import { formatDate, formatPrice, toIsoJst } from '@/lib/format';
import { newsCategoryLabel, SITE } from '@/lib/site';
import type { NewsDetail } from '@/lib/types';
import Breadcrumbs from '../Breadcrumbs';
import ShareButtons from '../ShareButtons';
import StatusPage from '../StatusPage';
import { WaveLine } from '../Deco';
import { IconArrowRight } from '../Icons';

/**
 * News article.
 *
 * Served at `/news/{id}`: Apache rewrites that path to `render.php`, which
 * hands back this static shell with the article's meta, OGP and Article
 * JSON-LD already injected, then this component fetches and renders the body.
 * `?id=` is accepted as well so the page also works under `next dev`.
 */
export default function NewsDetailClient() {
  const id = useArticleId();
  const [article, setArticle] = useState<NewsDetail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    if (id === undefined) return; // still resolving the URL on the client
    if (id === null) {
      setState('notfound');
      return;
    }
    const ac = new AbortController();
    fetchNewsDetail(id, ac.signal)
      .then((data) => {
        setArticle(data);
        setState('ready');
        track('view_news', { news_id: data.id, news_category: data.category });
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const status = (err as { status?: number }).status;
        setState(status === 404 ? 'notfound' : 'error');
      });
    return () => ac.abort();
  }, [id]);

  if (state === 'notfound') {
    return (
      <StatusPage
        code="404"
        title="お探しの記事が見つかりませんでした"
        message="記事が削除されたか、URLが変更された可能性があります。"
        links={[
          { href: '/news/', label: 'お知らせ一覧へ', primary: true },
          { href: '/', label: 'ホームへ' },
        ]}
      />
    );
  }

  if (state === 'error') {
    return (
      <StatusPage
        title="記事を読み込めませんでした"
        message="通信状況をご確認のうえ、時間をおいて再度お試しください。"
        links={[{ href: '/news/', label: 'お知らせ一覧へ', primary: true }]}
      />
    );
  }

  if (state === 'loading' || !article) {
    return (
      <section className="l-section l-section--paper">
        <div className="l-page c-article" aria-busy="true">
          <div className="c-skeleton" style={{ height: 34, width: '70%', marginBottom: 'var(--s-4)' }} />
          <div className="c-skeleton" style={{ height: 240, marginBottom: 'var(--s-5)' }} />
          <div className="c-skeleton" style={{ height: 16, marginBottom: 'var(--s-2)' }} />
          <div className="c-skeleton" style={{ height: 16, width: '85%' }} />
        </div>
      </section>
    );
  }

  const shareUrl = `${SITE.url}/news/${article.id}`;
  const related = article.relatedProduct;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'ホーム', href: '/' },
          { label: 'お知らせ', href: '/news/' },
          { label: article.title },
        ]}
      />

      <article className="l-section l-section--paper" style={{ paddingTop: 'var(--s-5)' }}>
        <div className="l-page c-article">
          <header className="c-article__head">
            <div className="c-article__meta">
              <time className="a-date" dateTime={toIsoJst(article.publishedAt)}>
                {formatDate(article.publishedAt)}
              </time>
              <span className="a-tag">{newsCategoryLabel(article.category)}</span>
              {/* Only shown when the article was actually edited after release. */}
              {article.updatedAt ? (
                <span className="a-date">（{formatDate(article.updatedAt)} 更新）</span>
              ) : null}
            </div>
            <h1 className="c-article__title">{article.title}</h1>
            <WaveLine style={{ color: 'var(--c-brand-soft)' }} width={140} />
          </header>

          {article.image ? (
            <div className="a-ratio a-ratio--16x9 c-article__hero">
              <img
                src={article.image.url}
                alt=""
                width={article.image.width}
                height={article.image.height}
                fetchPriority="high"
                decoding="async"
              />
            </div>
          ) : null}

          {/* Sanitised server-side against a strict allow-list before storage. */}
          <div className="c-articleBody" dangerouslySetInnerHTML={{ __html: article.body }} />

          {related ? (
            <aside
              style={{
                marginTop: 'var(--s-7)',
                padding: 'var(--s-5)',
                borderRadius: 'var(--r-hand)',
                background: 'var(--c-cream)',
              }}
            >
              <p className="a-enTitle" style={{ marginBottom: 'var(--s-4)' }}>Related Item</p>
              <Link
                href={`/shop/?category=${related.category}&product=${related.id}`}
                style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'center', textDecoration: 'none' }}
                onClick={() =>
                  track('click_news_product', {
                    news_id: article.id,
                    news_category: article.category,
                    product_id: related.id,
                    product_name: related.name,
                    category: related.category,
                    price: related.price,
                    currency: 'JPY',
                  })
                }
              >
                {related.thumb ? (
                  <span className="a-ratio a-ratio--1x1" style={{ width: 88, flex: 'none', borderRadius: 'var(--r-md)' }}>
                    <img src={related.thumb} alt="" width={88} height={88} loading="lazy" decoding="async" />
                  </span>
                ) : null}
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{related.name}</span>
                  <span style={{ color: 'var(--c-brand-dark)', fontWeight: 700 }}>
                    {formatPrice(related.price)}
                  </span>
                </span>
                <span className="a-btn">
                  この商品を見る
                  <IconArrowRight width={18} height={18} />
                </span>
              </Link>
            </aside>
          ) : null}

          <div style={{ marginTop: 'var(--s-7)' }}>
            <ShareButtons
              variant="list"
              url={shareUrl}
              title={`${article.title} | ${SITE.name}`}
              onShared={(method) =>
                track('share_news', { news_id: article.id, news_category: article.category, method })
              }
            />
          </div>

          <div style={{ marginTop: 'var(--s-7)', textAlign: 'center' }}>
            <Link href="/news/" className="a-btn a-btn--ghost">お知らせ一覧へ</Link>
          </div>
        </div>
      </article>
    </>
  );
}

/**
 * `/news/123` in production (rewritten by Apache) and `?id=123` under
 * `next dev`, where the dynamic path has no static file to serve.
 */
function useArticleId(): number | null | undefined {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => setHref(window.location.href), []);

  return useMemo(() => {
    if (!href) return undefined; // not resolved yet — not "missing"

    const url = new URL(href);
    const fromPath = /\/news\/(\d+)\/?$/.exec(url.pathname)?.[1];
    const raw = fromPath ?? url.searchParams.get('id');
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [href]);
}
