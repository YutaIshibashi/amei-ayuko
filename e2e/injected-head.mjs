/**
 * The head render.php injects for a dynamic URL, reduced to the fields the
 * tests assert on.
 *
 * Its own module so that the spec can import the expected values without
 * starting the server that uses them.
 */
export const INJECTED = {
  news: {
    title: 'テストのお知らせ 0 | amei ayuko',
    description: 'この記事だけの説明文です。',
    canonical: 'https://amei-ayuko.jp/news/100',
    ogType: 'article',
    image: 'https://amei-ayuko.jp/uploads/news/article-100.webp',
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: 'テストのお知らせ 0' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
    ],
  },
  product: {
    title: 'アルバムフレーク はじめての1年｜アルバムフレーク | amei ayuko',
    description: 'この商品だけの説明文です。',
    canonical: 'https://amei-ayuko.jp/shop/?category=album-flake&product=1001',
    ogType: 'product',
    image: 'https://amei-ayuko.jp/products/1001/00-large.webp',
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Product', name: 'アルバムフレーク はじめての1年' },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
    ],
  },
};
