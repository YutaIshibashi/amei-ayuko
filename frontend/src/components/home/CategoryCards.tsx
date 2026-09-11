'use client';

import Link from 'next/link';
import { CATEGORIES, EDGE_DECO } from '@/lib/site';
import { track } from '@/lib/analytics';
import EdgeDeco from '../EdgeDeco';
import Reveal from '../Reveal';
import { Flower, Sparkle } from '../Deco';
import { IconArrowRight } from '../Icons';

/**
 * The two fixed product categories.
 *
 * The top page deliberately shows categories, not a product list; each card
 * deep-links into the shop with the tab pre-selected.
 */
const CARD_ART = {
  'album-flake': { photo: '/brand/product-album-flake.jpg', color: 'var(--c-brand-soft)' },
  stamp: { photo: '/brand/product-stamp.jpg', color: 'var(--c-mint-soft)' },
} as const;

export default function CategoryCards() {
  return (
    <section className="l-section l-section--paper" aria-labelledby="category-title">
      <EdgeDeco {...EDGE_DECO.rabbitGirl} size={195} bottom="6%" />
      <Sparkle className="c-deco c-deco--float" style={{ top: '8%', right: '8%', color: 'var(--c-sun)' }} width={30} />

      <div className="l-page">
        <Reveal className="c-secHead">
          <span className="c-secHead__en a-enTitle">Products</span>
          <h2 className="c-secHead__jp" id="category-title">ラインナップ</h2>
          <p className="c-secHead__note">アルバムフレークとラバースタンプ、2つのカテゴリからお選びいただけます。</p>
        </Reveal>

        <div className="c-cats">
          {CATEGORIES.map((cat, i) => (
            <Reveal key={cat.slug} delay={i * 140}>
              <Link
                href={`/shop/?category=${cat.slug}`}
                className="c-cat"
                onClick={() => track('select_shop_category', { category: cat.slug, source: 'top_category_card' })}
              >
                <div className="a-ratio a-ratio--4x3 c-cat__photo">
                  <img
                    src={CARD_ART[cat.slug].photo}
                    alt={`${cat.ja}の商品イメージ`}
                    width={1080}
                    height={810}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <Flower className="c-cat__illust" style={{ color: CARD_ART[cat.slug].color }} width={86} />
                <div className="c-cat__body">
                  <span className="c-cat__en">{cat.en}</span>
                  <span className="c-cat__jp">{cat.ja}</span>
                  <span className="c-cat__note">{cat.note}</span>
                  <span className="c-cat__more">
                    商品を見る
                    <IconArrowRight width={18} height={18} />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
