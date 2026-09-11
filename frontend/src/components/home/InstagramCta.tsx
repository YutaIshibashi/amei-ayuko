'use client';

import { EDGE_DECO, INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/site';
import { track } from '@/lib/analytics';
import { useSettings } from '@/lib/hooks';
import EdgeDeco from '../EdgeDeco';
import Reveal from '../Reveal';
import { Heart, Sparkle } from '../Deco';
import { IconExternal, IconInstagram } from '../Icons';

/**
 * Instagram.
 *
 * A strong CTA rather than a live embed: third-party embeds are the single
 * heaviest thing that could land on this page, and they would hurt LCP/INP
 * for no editorial benefit.
 */
export default function InstagramCta() {
  const { instagramUrl } = useSettings();
  const url = instagramUrl || INSTAGRAM_URL;

  return (
    <section className="l-section l-section--berry" aria-labelledby="instagram-title">
      <EdgeDeco {...EDGE_DECO.bearBlack} size={125} top="16%" />
      <EdgeDeco {...EDGE_DECO.rabbit} size={125} bottom="14%" delay={140} />
      <div className="l-page">
        <Reveal className="c-insta">
          <Sparkle className="c-deco c-deco--float" style={{ top: '12%', left: '10%', color: 'var(--c-sun)' }} width={26} />
          <Heart className="c-deco" style={{ bottom: '14%', right: '12%', color: 'var(--c-berry)', opacity: 0.5 }} width={30} />

          <IconInstagram className="c-insta__icon" width={58} height={58} style={{ color: 'var(--c-brand)' }} />
          <h2 className="c-insta__title" id="instagram-title">
            Instagramでも作品を紹介しています
          </h2>
          <p className="c-insta__lead">
            制作の裏側や新作情報、イベント出店のお知らせはInstagramから。
            日々の制作のようすを、ゆるっと投稿しています。
          </p>
          <a
            className="a-btn a-btn--lg"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('click_instagram', { source: 'top_instagram_section', destination: 'instagram' })}
          >
            <IconInstagram width={20} height={20} />
            Instagramを見る
            <IconExternal width={16} height={16} aria-hidden="true" />
          </a>
          <p className="c-insta__handle" style={{ marginTop: 'var(--s-4)' }}>{INSTAGRAM_HANDLE}</p>
        </Reveal>
      </div>
    </section>
  );
}
