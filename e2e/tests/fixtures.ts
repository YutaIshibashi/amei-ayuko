import type { Page, Route } from '@playwright/test';

/**
 * API fixtures.
 *
 * The suite exercises the frontend against the static export, so the PHP
 * endpoints are stubbed at the network layer. That keeps CI free of PHP and
 * MySQL while still testing the parts the frontend owns — and it makes the
 * error paths (a 404 article, a failed submission) reproducible, which they
 * would not be against a live backend.
 */

export const SETTINGS = {
  siteTitle: 'amei ayuko',
  metaDescription: 'テスト用の説明文です。',
  ogpImage: '/brand/ogp-default.png',
  // Empty on purpose: no GA4 script must load during the tests.
  ga4MeasurementId: '',
  searchConsoleVerification: '',
  instagramUrl: 'https://www.instagram.com/amei_ayuko/',
  minneUrl: 'https://minne.com/@amei-ayuko',
  creemaUrl: 'https://www.creema.jp/c/amei-ayuko',
  mercariUrl: 'https://jp.mercari.com/user/profile/417108594',
  inframeUrl: 'https://amei-ayuko.shop-inframe.jp/',
  baseUrl: 'https://ameiayuko.base.shop/',
  rakumaUrl: 'https://fril.jp/shop/1e35a79cae65e567618ec8a3143e05f4',
  copyright: '© 2026 amei ayuko',
  brandConcept: 'ママの“あったらいいな”をカタチに。',
  aboutIntro: 'テスト用のAbout紹介文です。',
  contactIntro: 'テスト用のContact紹介文です。',
  footerCopy: 'ちいさな成長を、かわいく残す。',
  mainVisual: null,
};

export const CONTACT_TYPES = {
  types: [
    { id: 1, label: 'ロゴ制作', helpText: '用途やイメージをご記載ください' },
    { id: 2, label: '商品について', helpText: '商品名や商品URLをご記載ください' },
  ],
};

function product(id: string, name: string, category: 'album-flake' | 'stamp', price: number, images = 2) {
  return {
    id,
    name,
    description: `${name} の説明文です。\n\n・サイズ：50×50mm\n・素材：上質紙`,
    price,
    currency: 'JPY' as const,
    category,
    url: `https://minne.com/items/${id}`,
    inStock: true,
    sortOrder: Number(id),
    updatedAt: '2026-09-01T00:00:00+09:00',
    images: Array.from({ length: images }, (_, i) => ({
      thumb: i === 0 ? '/brand/category-album-flake.svg' : '/brand/about-works.svg',
      large: i === 0 ? '/brand/category-album-flake.svg' : '/brand/about-works.svg',
      width: 720,
      height: 540,
    })),
  };
}

/**
 * The four products the assertions name, plus filler.
 *
 * The filler is not padding for its own sake: with only two cards per category
 * the grid fits on a desktop viewport without scrolling, which silently made
 * the scroll-restoration test vacuous. There has to be enough here to scroll
 * at every viewport the suite runs.
 */
const NAMED_PRODUCTS = [
  product('1001', 'アルバムフレーク はじめての1年', 'album-flake', 880, 3),
  product('1002', 'アルバムフレーク 成長きろく', 'album-flake', 780),
  product('2001', 'ラバースタンプ おなまえ', 'stamp', 1580),
  product('2002', 'ラバースタンプ きょうのきぶん', 'stamp', 1280),
];

const FILLER_PRODUCTS = [
  ...Array.from({ length: 10 }, (_, i) =>
    product(`1${String(100 + i)}`, `アルバムフレーク テスト${i + 1}`, 'album-flake', 800 + i * 10),
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    product(`2${String(100 + i)}`, `ラバースタンプ テスト${i + 1}`, 'stamp', 1200 + i * 10),
  ),
];

export const PRODUCTS = {
  generatedAt: '2026-09-01T00:00:00+09:00',
  syncId: 'e2e',
  products: [...NAMED_PRODUCTS, ...FILLER_PRODUCTS],
};

/** Derived so the specs never hard-code a count that the fixture can drift from. */
export const PRODUCT_COUNTS = {
  'album-flake': PRODUCTS.products.filter((p) => p.category === 'album-flake').length,
  stamp: PRODUCTS.products.filter((p) => p.category === 'stamp').length,
} as const;

/** A small representative slice, for tests that would otherwise loop over all of them. */
export const REPRESENTATIVE_PRODUCTS = NAMED_PRODUCTS;

export const NEWS_ITEMS = Array.from({ length: 23 }, (_, i) => ({
  id: 100 + i,
  title: `テストのお知らせ ${i + 1}`,
  category: i % 2 === 0 ? 'new-product' : 'info',
  publishedAt: `2026-08-${String(28 - (i % 27)).padStart(2, '0')} 10:00:00`,
  updatedAt: null,
  image: i % 3 === 0 ? { url: '/brand/about-desk.svg', width: 480, height: 480 } : null,
  excerpt: `テストのお知らせ ${i + 1} の抜粋です。`,
}));

/** Installs every stub a page needs. Call before `page.goto`. */
export async function mockApi(page: Page): Promise<void> {
  await page.route('**/data/products.json', (route) => json(route, PRODUCTS));
  await page.route('**/api/settings.php', (route) => json(route, SETTINGS));
  await page.route('**/api/contact-types.php', (route) => json(route, CONTACT_TYPES));
  await page.route('**/api/csrf.php', (route) => json(route, { token: 'e2e-csrf-token' }));

  await page.route('**/api/news/index.php*', (route) => {
    const page_ = Number(new URL(route.request().url()).searchParams.get('page') ?? '1');
    const perPage = 10;
    const start = (page_ - 1) * perPage;
    return json(route, {
      items: NEWS_ITEMS.slice(start, start + perPage),
      page: page_,
      perPage,
      total: NEWS_ITEMS.length,
      totalPages: Math.ceil(NEWS_ITEMS.length / perPage),
    });
  });

  await page.route('**/api/news/detail.php*', (route) => {
    const id = Number(new URL(route.request().url()).searchParams.get('id') ?? '0');
    const item = NEWS_ITEMS.find((n) => n.id === id);
    if (!item) {
      return json(route, { error: 'not_found', message: '記事が見つかりませんでした。' }, 404);
    }
    return json(route, {
      ...item,
      body: '<p>テスト記事の本文です。</p><h2>見出し</h2><p>段落です。</p>',
      relatedProduct: {
        id: '1001',
        name: 'アルバムフレーク はじめての1年',
        category: 'album-flake',
        thumb: '/brand/category-album-flake.svg',
        price: 880,
      },
    });
  });

  // Cloudflare's challenge script never loads in CI.
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort());
}

/** Fails every contact submission, for the retry / alternative-route test. */
export async function mockContactFailure(page: Page): Promise<void> {
  await page.route('**/api/contact.php', (route) =>
    json(route, { error: 'mail_failed', message: '送信できませんでした。' }, 502),
  );
}

export async function mockContactSuccess(page: Page): Promise<void> {
  await page.route('**/api/contact.php', (route) => json(route, { ok: true }));
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}
