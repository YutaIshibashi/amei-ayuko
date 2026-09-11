'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchProducts } from '@/lib/api';
import { track } from '@/lib/analytics';
import { CATEGORIES, DEFAULT_CATEGORY, EDGE_DECO, isCategorySlug, type CategorySlug } from '@/lib/site';
import type { Product } from '@/lib/types';
import StatusPage from '../StatusPage';
import { Cloud, Sparkle } from '../Deco';
import ProductCard from './ProductCard';
import ProductModal from './ProductModal';
import EdgeDeco from '../EdgeDeco';

/** Number of cards that are (roughly) above the fold on a wide screen. */
const EAGER_CARDS = 4;

/**
 * Online Shop.
 *
 * URL is the single source of truth for both the selected tab and the open
 * product, so a deep link, a browser Back press and a card click all end up in
 * exactly the same state:
 *
 *   /shop/?category=album-flake
 *   /shop/?category=album-flake&product=12345
 *
 * Rules encoded here:
 *  - unknown `category` falls back to Album Flake;
 *  - when `product` and `category` disagree, the product wins and the URL is
 *    corrected with replaceState, so the wrong URL never enters history;
 *  - an unknown `product` renders 404 (PHP sends the real 404 status).
 */
export default function ShopClient() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const urlCategory = searchParams.get('category');
  const urlProduct = searchParams.get('product');

  const category: CategorySlug = isCategorySlug(urlCategory) ? urlCategory : DEFAULT_CATEGORY;

  useEffect(() => {
    const ac = new AbortController();
    fetchProducts(ac.signal)
      .then((payload) => setProducts(payload.products))
      .catch(() => { if (!ac.signal.aborted) setLoadError(true); });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    track('view_shop', { category });
    // Only the first landing counts as "viewed the shop"; tab changes are
    // reported separately as select_shop_category.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** True when this session pushed the product URL, so Back is the right undo. */
  const pushedByUs = useRef(false);

  const selected = useMemo(
    () => (urlProduct && products ? products.find((p) => p.id === urlProduct) ?? null : null),
    [urlProduct, products],
  );

  // The URL said one category, the product data says another: trust the data.
  useEffect(() => {
    if (!selected) return;
    if (selected.category === urlCategory) return;
    const url = `/shop/?category=${selected.category}&product=${selected.id}`;
    window.history.replaceState(null, '', url);
  }, [selected, urlCategory]);

  const selectCategory = useCallback((next: CategorySlug) => {
    if (next === category) return;
    track('select_shop_category', { category: next, source: 'shop_tabs' });
    // replaceState, not push: switching tabs should not stack history entries.
    window.history.replaceState(null, '', `/shop/?category=${next}`);
  }, [category]);

  const openProduct = useCallback((product: Product) => {
    pushedByUs.current = true;
    window.history.pushState(null, '', `/shop/?category=${product.category}&product=${product.id}`);
  }, []);

  const closeProduct = useCallback(() => {
    if (pushedByUs.current) {
      // Opened from the list: this document is `/shop/`'s own, head and all,
      // so stepping back through history is both the cheapest close and the
      // one that restores exactly what was there before.
      pushedByUs.current = false;
      window.history.back();
      return;
    }

    // Arrived directly on the product URL. This document is not `/shop/` — it
    // is the metadata-free product shell with the product's title, canonical,
    // OGP and Product JSON-LD injected into it by render.php. Rewriting only
    // the URL would leave every one of those describing a product that is no
    // longer on screen, at a URL that is now the listing's.
    //
    // So fetch the listing for real. `replace`, not `assign`, so Back still
    // leaves the site rather than re-opening the modal.
    window.location.replace(`/shop/?category=${category}`);
  }, [category]);

  const visible = useMemo(
    () => (products ?? []).filter((p) => p.category === category),
    [products, category],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of products ?? []) map.set(p.category, (map.get(p.category) ?? 0) + 1);
    return map;
  }, [products]);

  // A product id that does not exist is a 404, not an empty shop.
  if (urlProduct && products && !selected) {
    return (
      <StatusPage
        code="404"
        title="お探しの商品が見つかりませんでした"
        message={
          <>
            商品が販売終了になったか、URLが変更された可能性があります。
            <br />
            ショップから他の商品もご覧ください。
          </>
        }
        links={[
          { href: '/shop/?category=album-flake', label: 'アルバムフレークを見る', primary: true },
          { href: '/shop/?category=stamp', label: 'スタンプを見る' },
          { href: '/', label: 'ホームへ' },
        ]}
      />
    );
  }

  return (
    <>
      <section className="l-section l-section--cream" style={{ paddingTop: 'var(--s-6)' }}>
        <EdgeDeco {...EDGE_DECO.bearBlack} size={120} top="18%" />
        <Cloud className="c-deco" style={{ top: '4%', right: '4%', color: '#fff', opacity: 0.8 }} width={180} />
        <Sparkle className="c-deco c-deco--float" style={{ top: '16%', left: '6%', color: 'var(--c-sun)' }} width={26} />

        <div className="l-page">
          <div className="c-pageHead">
            <span className="c-pageHead__en">Online Shop</span>
            <h1 className="c-pageHead__jp">オンラインショップ</h1>
            <p className="c-pageHead__note">
              ご購入はminneのページで承っています。気になる商品をタップすると詳細が開きます。
            </p>
          </div>

          <div className="c-tabs" role="tablist" aria-label="商品カテゴリ">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.slug}
                type="button"
                role="tab"
                id={`tab-${cat.slug}`}
                className="c-tabs__tab"
                aria-selected={cat.slug === category}
                aria-controls={`panel-${cat.slug}`}
                tabIndex={cat.slug === category ? 0 : -1}
                onClick={() => selectCategory(cat.slug)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  e.preventDefault();
                  const i = CATEGORIES.findIndex((c) => c.slug === category);
                  const next = CATEGORIES[(i + (e.key === 'ArrowRight' ? 1 : CATEGORIES.length - 1)) % CATEGORIES.length]!;
                  selectCategory(next.slug);
                  document.getElementById(`tab-${next.slug}`)?.focus();
                }}
              >
                {cat.en}
                {counts.has(cat.slug) ? <span className="c-tabs__count">{counts.get(cat.slug)}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="l-section l-section--paper" style={{ paddingTop: 'var(--s-6)' }}>
        <EdgeDeco {...EDGE_DECO.rabbit} size={120} top="6%" />
        <div className="l-page">
          <div
            role="tabpanel"
            id={`panel-${category}`}
            aria-labelledby={`tab-${category}`}
            tabIndex={-1}
          >
            {loadError ? (
              <div className="c-empty">
                <p>商品情報を読み込めませんでした。</p>
                <p style={{ marginTop: 'var(--s-3)' }}>
                  <button type="button" className="a-btn a-btn--ghost" onClick={() => window.location.reload()}>
                    再読み込みする
                  </button>
                </p>
              </div>
            ) : products === null ? (
              <ul className="c-grid" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="c-skeleton c-skeleton__card" />
                ))}
              </ul>
            ) : visible.length === 0 ? (
              <div className="c-empty">
                <Sparkle className="c-empty__illust" style={{ color: 'var(--c-brand-soft)' }} width={120} />
                <p>ただいまこのカテゴリの商品はありません。</p>
                <p style={{ fontSize: 'var(--fs-sm)' }}>新作の入荷はInstagramとお知らせでご案内しています。</p>
              </div>
            ) : (
              <ul className="c-grid">
                {visible.map((product, i) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onOpen={openProduct}
                    priority={i < EAGER_CARDS}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {selected ? <ProductModal product={selected} onClose={closeProduct} /> : null}
    </>
  );
}
