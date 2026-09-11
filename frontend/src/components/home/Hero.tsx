'use client';

import Link from 'next/link';
import { ASSETS, SITE } from '@/lib/site';
import { useSettings } from '@/lib/hooks';
import { Blob, Cloud, Flower, Heart, Sparkle, WaveDivider } from '../Deco';
import { IconArrowRight, IconShop } from '../Icons';

/**
 * Hero.
 *
 * The copy is fixed in code (it is brand voice, not editorial content); only
 * the main visual is swappable from the admin screen, so the image slot has a
 * reserved aspect ratio and a shipped fallback to keep LCP stable and CLS at 0.
 */
export default function Hero() {
  const { mainVisual } = useSettings();
  const visual = mainVisual ?? ASSETS.heroFallback;

  return (
    <section className="c-hero" aria-labelledby="hero-title">
      <Blob className="c-deco" style={{ top: '-8%', left: '-12%', color: 'var(--c-brand-soft)', opacity: 0.28 }} width={420} />
      <Cloud className="c-deco c-deco--float" style={{ top: '18%', right: '4%', color: '#fff', opacity: 0.85 }} width={200} />
      <Sparkle className="c-deco c-deco--float" style={{ top: '26%', left: '8%', color: 'var(--c-sun)' }} width={30} />
      <Heart className="c-deco" style={{ bottom: '20%', right: '14%', color: 'var(--c-berry)', opacity: 0.45 }} width={38} />
      <Flower className="c-deco c-deco--float" style={{ bottom: '10%', left: '6%', color: 'var(--c-mint)', opacity: 0.5 }} width={64} />

      <div className="l-page c-hero__inner">
        <div>
          {/* Blooms open from nothing on load — see `hero-logo-bloom`. */}
          <img
            className="c-hero__logo"
            src={ASSETS.topIcon}
            alt={SITE.name}
            width={640}
            height={640}
            fetchPriority="high"
          />

          <h1 className="c-hero__copy" id="hero-title">
            ママの<em>&ldquo;あったらいいな&rdquo;</em>を
            <br />
            カタチに。
          </h1>

          <p className="c-hero__lead">
            小さな成長を、かわいく残す手描きの紙モノ。
            <br />
            アルバムフレークとラバースタンプで、
            <br />
            忙しい毎日の「思い出づくり」をお手伝いします。
          </p>

          <div className="c-hero__actions">
            <Link href="/shop/" className="a-btn a-btn--lg">
              <IconShop width={20} height={20} />
              オンラインショップを見る
            </Link>
            <Link href="/about/" className="a-btn a-btn--ghost a-btn--lg">
              amei ayukoについて
              <IconArrowRight width={18} height={18} />
            </Link>
          </div>
        </div>

        <div className="c-hero__visual">
          <div className="c-hero__frame">
            {/* Reserved 4:3 / 1:1 frame: swapping this image never shifts layout. */}
            <img
              src={visual}
              alt="amei ayuko の手描きアルバムフレークとラバースタンプ"
              width={880}
              height={880}
              fetchPriority="high"
              decoding="async"
            />
          </div>
          <Sparkle className="c-deco c-deco--float" style={{ top: '-4%', right: '6%', color: 'var(--c-sun)', zIndex: 2 }} width={34} />
        </div>
      </div>

      <div className="c-hero__scroll" aria-hidden="true">
        <span>Scroll</span>
        <span className="c-hero__scrollBar" />
      </div>

      <WaveDivider color="var(--c-cream)" className="c-hero__wave" />
    </section>
  );
}
