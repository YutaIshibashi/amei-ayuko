import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import ShopShell from '@/components/shop/ShopShell';
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
 * The shop itself, at `/shop/`.
 *
 * The page is static; the product list, the selected tab and the product modal
 * are all driven client-side from the URL. A product URL
 * (`/shop/?…&product={id}`) is a different document — see `shop/product/`,
 * which carries no metadata of its own so that render.php's injected head is
 * the only one. This one keeps its metadata, because `/shop/` is a real page
 * that nothing injects into.
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
      <ShopShell />
    </>
  );
}
