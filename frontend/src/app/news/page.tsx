import type { Metadata } from 'next';
import { Suspense } from 'react';
import JsonLd from '@/components/JsonLd';
import NewsListClient from '@/components/news/NewsListClient';
import { SITE } from '@/lib/site';

const title = 'お知らせ';
const description =
  'amei ayuko の新商品・イベント出店・お知らせの一覧です。手描きのアルバムフレークやラバースタンプの最新情報をお届けします。';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/news/' },
  openGraph: {
    title: `${title} | ${SITE.name}`,
    description,
    url: `${SITE.url}/news/`,
    type: 'website',
    images: [{ url: '/brand/ogp-default.png', width: 1200, height: 630 }],
  },
};

export default function NewsIndexPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: title,
          description,
          url: `${SITE.url}/news/`,
          isPartOf: { '@type': 'WebSite', name: SITE.name, url: `${SITE.url}/` },
        }}
      />
      <Suspense fallback={null}>
        <NewsListClient />
      </Suspense>
    </>
  );
}
