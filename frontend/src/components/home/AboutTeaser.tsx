'use client';

import Link from 'next/link';
import { ASSETS } from '@/lib/site';
import { useSettings } from '@/lib/hooks';
import Reveal from '../Reveal';
import { WaveLine } from '../Deco';
import { IconArrowRight } from '../Icons';

/**
 * About teaser.
 *
 * Kept deliberately restrained: the top page is about the products and the
 * brand, and the maker steps forward on the About page instead.
 */
export default function AboutTeaser() {
  const { aboutIntro } = useSettings();

  return (
    <section className="l-section l-section--paper" aria-labelledby="about-teaser-title">
      <div className="l-page c-aboutTeaser">
        <Reveal className="c-aboutTeaser__avatar">
          <img
            src={ASSETS.avatar}
            alt="amei ayuko の似顔絵イラスト"
            width={440}
            height={440}
            loading="lazy"
            decoding="async"
          />
        </Reveal>

        <Reveal delay={120}>
          <span className="c-secHead__en a-enTitle" style={{ display: 'block' }}>About</span>
          <h2 className="a-jpTitle" id="about-teaser-title" style={{ marginTop: 'var(--s-1)' }}>
            つくっているひと
          </h2>
          <WaveLine style={{ marginTop: 'var(--s-3)', color: 'var(--c-brand-soft)' }} width={130} />
          <p className="c-aboutTeaser__name">amei ayuko</p>
          <p className="c-aboutTeaser__text">{aboutIntro}</p>
          <Link href="/about/" className="a-btn a-btn--ghost">
            プロフィールを見る
            <IconArrowRight width={18} height={18} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
