'use client';

import Link from 'next/link';
import { EDGE_DECO, INSTAGRAM_URL } from '@/lib/site';
import { track } from '@/lib/analytics';
import { useSettings } from '@/lib/hooks';
import EdgeDeco from '../EdgeDeco';
import Reveal from '../Reveal';
import { Blob, DottedArc, PillarIcon } from '../Deco';
import { IconArrowRight, IconInstagram, IconMail } from '../Icons';

const WORKS = [
  { title: 'ロゴ制作',     note: 'お店やブランドの「顔」になる、手描きの温かいロゴを。' },
  { title: '名刺デザイン', note: '渡すのが楽しくなる、あなたらしい一枚をつくります。' },
  { title: 'チラシデザイン', note: 'イベントや教室の告知に。伝わるレイアウトでご提案。' },
];

/**
 * Design works.
 *
 * There is no dedicated Design Works page by design — this block on the top
 * page states that the work is offered and routes to Contact or Instagram.
 */
export default function DesignSection() {
  const { instagramUrl } = useSettings();

  return (
    <section className="l-section l-section--creamDeep" aria-labelledby="design-title">
      <EdgeDeco {...EDGE_DECO.girl} size={185} top="12%" />
      <Blob className="c-deco" style={{ bottom: '-14%', right: '-10%', color: 'var(--c-mint-soft)', opacity: 0.4 }} width={360} />

      <div className="l-page c-design">
        <Reveal>
          <span className="c-secHead__en a-enTitle" style={{ display: 'block' }}>Design Works</span>
          <h2 className="a-jpTitle" id="design-title" style={{ marginTop: 'var(--s-1)' }}>
            <span className="a-handLine">デザイン制作</span>も承ります
          </h2>
          <p className="a-lead" style={{ marginTop: 'var(--s-4)' }}>
            イラストレーターとして、ロゴ・名刺・チラシのデザインもお受けしています。
            個人事業主さま、小さなお店の方からのご相談を多くいただいています。
            まずはイメージだけでも、お気軽にご相談ください。
          </p>

          <ul className="c-design__list">
            {WORKS.map((w) => (
              <li className="c-design__item" key={w.title}>
                <PillarIcon kind="hand" className="c-design__icon" />
                <span>
                  <span className="c-design__itemTitle" style={{ display: 'block' }}>{w.title}</span>
                  <span className="c-design__itemNote">{w.note}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="c-design__actions">
            <Link href="/contact/" className="a-btn">
              <IconMail width={18} height={18} />
              お問い合わせ・お見積り
            </Link>
            <a
              className="a-btn a-btn--ghost"
              href={instagramUrl || INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('click_instagram', { source: 'design_section', destination: 'instagram' })}
            >
              <IconInstagram width={18} height={18} />
              InstagramのDMで相談
              <IconArrowRight width={16} height={16} />
            </a>
          </div>
        </Reveal>

        <Reveal delay={140} className="c-design__visual">
          <div className="a-ratio a-ratio--1x1" style={{ borderRadius: 'var(--r-blob)', boxShadow: 'var(--shadow-md)' }}>
            <img
              src="/brand/design-works.svg"
              alt="ロゴ・名刺・チラシのデザイン制作イメージ"
              width={640}
              height={640}
              loading="lazy"
              decoding="async"
            />
          </div>
          <DottedArc className="c-deco" style={{ bottom: '-8%', left: '-6%', color: 'var(--c-brand)' }} width={170} />
        </Reveal>
      </div>
    </section>
  );
}
