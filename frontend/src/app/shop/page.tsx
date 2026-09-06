import type { Metadata } from 'next';
import { Suspense } from 'react';
import JsonLd from '@/components/JsonLd';
import ShopClient from '@/components/shop/ShopClient';
import { SITE } from '@/lib/site';

const title = 'オンラインショップ｜アルバムフレーク・ラバースタンプ';
const description =
  '手描きのアルバムフレークとラバースタンプの一覧です。育児アルバムや成長記録づくりにぴったりの紙モノを、minneにて販売しています。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/shop/' },
  openGraph: {
    title: `${title} | ${SITE.name}`,
    description,
    url: `${SITE.url}/shop/`,
    type: 'website',
    images: [{ url: '/brand/ogp-default.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', title, description },
};

/**
 * Shop shell.
 *
 * The page itself is fully static; the product list, the selected tab and the
 * product modal are all driven client-side from the URL. For crawlers,
 * `render.php` rewrites the head of this same HTML when a `?product=` query is
 * present, so each product URL still returns its own title, description,
 * canonical, OGP and Product JSON-LD.
 */
export default function ShopPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: `${SITE.url}/shop/`,
          isPartOf: { '@type': 'WebSite', name: SITE.name, url: `${SITE.url}/` },
        }}
      />
      {/* useSearchParams requires a Suspense boundary under static export. */}
      <Suspense fallback={<ShopFallback />}>
        <ShopClient />
      </Suspense>
    </>
  );
}

function ShopFallback() {
  return (
    <section className="l-section l-section--cream">
      <div className="l-page">
        <div className="c-pageHead">
          <span className="c-pageHead__en">Online Shop</span>
          <h1 className="c-pageHead__jp">オンラインショップ</h1>
        </div>
        <ul className="c-grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="c-skeleton c-skeleton__card" />
          ))}
        </ul>
      </div>
    </section>
  );
}
