import Link from 'next/link';
import { EDGE_DECO } from '@/lib/site';
import EdgeDeco from '../EdgeDeco';
import Reveal from '../Reveal';
import { PillarIcon, WaveLine } from '../Deco';
import { IconArrowRight } from '../Icons';

const PILLARS = [
  { kind: 'mom' as const,    title: '3児のママ',   note: '子育ての現場で生まれた「欲しかった！」を形に。' },
  { kind: 'hand' as const,   title: '手描き',     note: '一枚ずつ手で描いた、温かみのある線とかたち。' },
  { kind: 'growth' as const, title: '成長記録',   note: '男の子も女の子も赤ちゃんも、みんなで使えます。' },
  { kind: 'easy' as const,   title: '使いやすさ', note: '鉛筆でもサッと書ける、やさしい紙質にこだわって。' },
];

/**
 * Concept.
 *
 * The full brand statement lives on About; the top page shows only a short
 * copy plus the four pillars, then hands off.
 */
export default function Concept() {
  return (
    <section className="l-section l-section--cream" aria-labelledby="concept-title">
      <EdgeDeco {...EDGE_DECO.rabbits} size={200} top="8%" />
      <EdgeDeco {...EDGE_DECO.baby} size={150} left="7%" delay={120} />
      <div className="l-page">
        <Reveal className="c-secHead">
          <span className="c-secHead__en a-enTitle">Concept</span>
          <h2 className="c-secHead__jp" id="concept-title">コンセプト</h2>
          <WaveLine style={{ margin: '0.75rem auto 0', color: 'var(--c-brand-soft)' }} width={140} />
        </Reveal>

        <Reveal delay={80}>
          <p className="c-concept__lead">
            男の子も、女の子も、赤ちゃんも。
            <br />
            性別を問わず<strong>みんなで使える</strong>、
            <br />
            温かみあふれる手描きの紙モノを作っています。
          </p>
        </Reveal>

        <ul className="c-pillars">
          {PILLARS.map((p, i) => (
            <Reveal as="li" key={p.kind} delay={120 + i * 90} className="c-pillar">
              <PillarIcon kind={p.kind} className="c-pillar__icon" />
              <span className="c-pillar__title">{p.title}</span>
              <span className="c-pillar__note">{p.note}</span>
            </Reveal>
          ))}
        </ul>

        <Reveal delay={480} style={{ textAlign: 'center', marginTop: 'var(--s-7)' }}>
          <Link href="/about/" className="a-btn a-btn--ghost">
            ブランドについて詳しく
            <IconArrowRight width={18} height={18} />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
