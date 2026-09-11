import type { Metadata } from 'next';
import Link from 'next/link';
import JsonLd from '@/components/JsonLd';
import Reveal from '@/components/Reveal';
import { Blob, Cloud, Flower, PillarIcon, Sparkle, WaveLine } from '@/components/Deco';
import { IconArrowRight, IconInstagram, IconShop } from '@/components/Icons';
import { ASSETS, EDGE_DECO, INSTAGRAM_URL, SITE } from '@/lib/site';
import EdgeDeco from '@/components/EdgeDeco';

const title = 'amei ayuko について';
const description =
  '3児のママでありイラストレーターの amei ayuko のプロフィールとブランドストーリー。手描きのアルバムフレーク・ラバースタンプができるまでの制作工程をご紹介します。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/about/' },
  openGraph: {
    title: `${title} | ${SITE.name}`,
    description,
    url: `${SITE.url}/about/`,
    type: 'profile',
    images: [{ url: '/brand/ogp-default.png', width: 1200, height: 630 }],
  },
};

const STEPS = [
  { title: 'アイデア', note: '子育ての「これ欲しい！」をメモ。使う場面から考えます。' },
  { title: '手描き', note: '紙とペンでラフを重ねて、線のやわらかさを決めていきます。' },
  { title: 'データ調整', note: '印刷に合わせて線幅や余白を微調整。実際に書き込んで確認。' },
  { title: '商品化', note: '紙質やサイズを試作しながら、使いやすい形に仕上げます。' },
];

const PHOTOS = [
  { src: '/brand/about-hands.svg', caption: '一枚ずつ手で描いています' },
  { src: '/brand/about-tools.svg', caption: '使い慣れた画材たち' },
  { src: '/brand/about-desk.svg', caption: '制作デスクのようす' },
  { src: '/brand/about-works.svg', caption: '仕上がった紙モノ' },
];

/**
 * About.
 *
 * Where the full brand statement lives (the top page only teases it). No
 * photograph of the maker by request — the existing illustrated avatar stands
 * in, and the workspace photos carry the human presence instead.
 */
export default function AboutPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: title,
          description,
          url: `${SITE.url}/about/`,
          mainEntity: {
            '@type': 'Person',
            name: SITE.name,
            jobTitle: 'イラストレーター',
            description: '3児のママ。手描きのアルバムクラフトとラバースタンプを制作。',
            image: `${SITE.url}${ASSETS.avatar}`,
            sameAs: [INSTAGRAM_URL],
          },
        }}
      />

      <section className="l-section l-section--cream" style={{ paddingTop: 'var(--s-6)' }}>
        <Cloud className="c-deco" style={{ top: '6%', right: '5%', color: '#fff', opacity: 0.85 }} width={190} />
        <Blob className="c-deco" style={{ bottom: '-16%', left: '-10%', color: 'var(--c-brand-soft)', opacity: 0.28 }} width={340} />

        <div className="l-page">
          <div className="c-pageHead">
            <span className="c-pageHead__en">About</span>
            <h1 className="c-pageHead__jp">amei ayuko について</h1>
          </div>

          <Reveal className="c-aboutTeaser" style={{ marginTop: 'var(--s-6)' }}>
            <div className="c-aboutTeaser__avatar">
              <img src={ASSETS.avatar} alt="amei ayuko のプロフィールアイコン" width={440} height={440} decoding="async" />
            </div>
            <div>
              <p className="c-aboutTeaser__name">amei ayuko</p>
              <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--c-ink-soft)', letterSpacing: '0.08em' }}>
                イラストレーター／3児のママ
              </p>
              <WaveLine style={{ marginBlock: 'var(--s-3)', color: 'var(--c-brand-soft)' }} width={140} />
              <p style={{ marginBottom: 'var(--s-4)' }}>
                男の子も、女の子も、赤ちゃんも。性別を問わずみんなで使える、温かみあふれる手描きのアルバムクラフトやラバースタンプなどの小物をつくっています。
              </p>
              <p>
                3児のママだからこそわかる「こういうの欲しかった！」という使いやすさにこだわり、鉛筆でもサッと書き込める優しい質感に仕上げています。忙しい毎日のなかで、子どもたちとママが笑顔になれる特別な&ldquo;思い出づくり&rdquo;をお手伝いします。
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="l-section l-section--paper" aria-labelledby="story-title">
        <EdgeDeco {...EDGE_DECO.rabbits} size={175} top="10%" />
        <Sparkle className="c-deco c-deco--float" style={{ top: '10%', left: '7%', color: 'var(--c-sun)' }} width={28} />
        <div className="l-page l-prose">
          <Reveal className="c-secHead">
            <span className="c-secHead__en a-enTitle">Story</span>
            <h2 className="c-secHead__jp" id="story-title">ブランドストーリー</h2>
          </Reveal>

          <Reveal delay={80} style={{ display: 'grid', gap: 'var(--s-4)' }}>
            <p>
              はじまりは、自分の子どものアルバムづくりでした。写真は撮っているのに、なかなか形にできない。かわいいシールを探しても、女の子向けばかりだったり、書き込む欄が小さかったり。「こういうのがあったらいいのに」が、少しずつたまっていきました。
            </p>
            <p>
              そこで、自分で描いてみることにしました。男の子でも女の子でも使える、やさしい線。鉛筆でもインクがのる紙。忙しい日でも、貼って、ひとこと書くだけで残せる大きさ。試作と実際の使用を何度もくり返して、いまのアルバムフレークとラバースタンプができました。
            </p>
            <p>
              完璧なアルバムじゃなくていい。ちょっと手を止めて、その日のことを一行残せたら、それでじゅうぶん。そんな気持ちで、これからも「あったらいいな」をカタチにしていきます。
            </p>
          </Reveal>
        </div>
      </section>

      <section className="l-section l-section--mint" aria-labelledby="process-title">
        <EdgeDeco {...EDGE_DECO.rabbitGirl} size={175} bottom="8%" />
        <div className="l-page">
          <Reveal className="c-secHead">
            <span className="c-secHead__en a-enTitle">Process</span>
            <h2 className="c-secHead__jp" id="process-title">制作工程</h2>
            <p className="c-secHead__note">ひとつの商品ができるまで。</p>
          </Reveal>

          <ol className="c-steps" style={{ marginTop: 'var(--s-7)' }}>
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 110} className="c-step">
                <PillarIcon kind={(['mom', 'hand', 'easy', 'growth'] as const)[i]!} className="a-visuallyHidden" />
                <p className="c-step__title">{step.title}</p>
                <p className="c-step__note">{step.note}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="l-section l-section--paper" aria-labelledby="workspace-title">
        <EdgeDeco {...EDGE_DECO.bearBoy} size={170} top="14%" />
        <Flower className="c-deco c-deco--float" style={{ bottom: '8%', right: '6%', color: 'var(--c-brand-soft)' }} width={72} />
        <div className="l-page">
          <Reveal className="c-secHead">
            <span className="c-secHead__en a-enTitle">Workspace</span>
            <h2 className="c-secHead__jp" id="workspace-title">制作風景</h2>
          </Reveal>

          <Reveal delay={80} className="c-photoGrid">
            {PHOTOS.map((photo) => (
              <figure key={photo.src}>
                <span className="a-ratio a-ratio--1x1" style={{ borderRadius: 'var(--r-hand)', display: 'block' }}>
                  <img src={photo.src} alt={photo.caption} width={480} height={480} loading="lazy" decoding="async" />
                </span>
                <figcaption>{photo.caption}</figcaption>
              </figure>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="l-section l-section--cream" aria-labelledby="profile-title">
        <EdgeDeco {...EDGE_DECO.girl} size={170} top="12%" />
        <div className="l-page l-prose">
          <Reveal className="c-secHead">
            <span className="c-secHead__en a-enTitle">Profile</span>
            <h2 className="c-secHead__jp" id="profile-title">プロフィール</h2>
          </Reveal>

          <Reveal delay={80}>
            <table className="c-profileTable">
              <tbody>
                <tr><th scope="row">名前</th><td>amei ayuko（アメイ アユコ）</td></tr>
                <tr><th scope="row">活動内容</th><td>イラスト制作／オリジナル商品の企画・販売／ロゴ・名刺・チラシのデザイン</td></tr>
                <tr><th scope="row">主な商品</th><td>アルバムフレーク、ラバースタンプ</td></tr>
                <tr><th scope="row">販売先</th><td>minne ほか各ハンドメイドマーケット</td></tr>
                <tr><th scope="row">SNS</th><td><a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">Instagram</a></td></tr>
              </tbody>
            </table>

            <div className="c-status__links" style={{ marginTop: 'var(--s-7)' }}>
              <Link href="/shop/" className="a-btn">
                <IconShop width={18} height={18} />
                オンラインショップ
              </Link>
              <a className="a-btn a-btn--ghost" href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                <IconInstagram width={18} height={18} />
                Instagram
              </a>
              <Link href="/contact/" className="a-btn a-btn--ghost">
                お問い合わせ
                <IconArrowRight width={18} height={18} />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
