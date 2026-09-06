import type { Metadata } from 'next';
import ContactForm from '@/components/contact/ContactForm';
import ContactIntro from '@/components/contact/ContactIntro';
import JsonLd from '@/components/JsonLd';
import { Cloud, Sparkle } from '@/components/Deco';
import { SITE } from '@/lib/site';

const title = 'お問い合わせ';
const description =
  'ロゴ制作・名刺デザイン・チラシデザインのご依頼、お見積り、商品についてのご質問はこちらから。2〜3営業日以内にご返信いたします。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/contact/' },
  openGraph: {
    title: `${title} | ${SITE.name}`,
    description,
    url: `${SITE.url}/contact/`,
    type: 'website',
    images: [{ url: '/brand/ogp-default.png', width: 1200, height: 630 }],
  },
};

export default function ContactPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ContactPage',
          name: title,
          description,
          url: `${SITE.url}/contact/`,
          isPartOf: { '@type': 'WebSite', name: SITE.name, url: `${SITE.url}/` },
        }}
      />

      <section className="l-section l-section--cream" style={{ paddingTop: 'var(--s-6)' }}>
        <Cloud className="c-deco" style={{ top: '5%', right: '6%', color: '#fff', opacity: 0.85 }} width={170} />
        <Sparkle className="c-deco c-deco--float" style={{ bottom: '10%', left: '5%', color: 'var(--c-sun)' }} width={26} />

        <div className="l-page">
          <div className="c-pageHead">
            <span className="c-pageHead__en">Contact</span>
            <h1 className="c-pageHead__jp">お問い合わせ</h1>
          </div>

          <ContactIntro />
          <ContactForm />
        </div>
      </section>
    </>
  );
}
