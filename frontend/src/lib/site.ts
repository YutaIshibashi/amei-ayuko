/**
 * Build-time site constants.
 *
 * Anything an editor may change at runtime (titles, OGP image, social URLs,
 * GA4 id …) lives in MySQL and is delivered by `/api/settings.php`; see
 * `useSettings()`. The values here are the safe fallbacks used during the
 * static build and before that request resolves, so the first paint is never
 * empty.
 */
export const SITE = {
  name: 'amei ayuko',
  nameJa: 'amei ayuko（アメイ アユコ）',
  /** Absolute origin, needed for canonical / OGP URLs at build time. */
  url: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://amei-ayuko.jp').replace(/\/$/, ''),
  description:
    '3児のママがつくる、手描きのアルバムフレーク・ラバースタンプ。子どもの成長をかわいく残す紙モノと、ロゴ・名刺・チラシのデザイン制作。',
  concept: 'ママの“あったらいいな”をカタチに。',
  conceptSub: '小さな成長を可愛く残す手描き紙モノ',
  locale: 'ja_JP',
  replyLeadTime: '2〜3営業日',
} as const;

/** External shops. minne is the primary purchase destination. */
export const SHOPS = [
  { key: 'minne',   label: 'minne',   url: 'https://minne.com/@amei-ayuko',                                     primary: true  },
  { key: 'creema',  label: 'Creema',  url: 'https://www.creema.jp/c/amei-ayuko',                                primary: false },
  { key: 'mercari', label: 'メルカリ', url: 'https://jp.mercari.com/user/profile/417108594',                     primary: false },
  { key: 'inframe', label: 'INFRAME', url: 'https://amei-ayuko.shop-inframe.jp/',                               primary: false },
  { key: 'base',    label: 'BASE',    url: 'https://ameiayuko.base.shop/',                                      primary: false },
  { key: 'rakuma',  label: 'ラクマ',   url: 'https://fril.jp/shop/1e35a79cae65e567618ec8a3143e05f4',             primary: false },
] as const;

export const INSTAGRAM_URL = 'https://www.instagram.com/ayuko_amei/';
export const INSTAGRAM_HANDLE = '@ayuko_amei';

/** Header navigation. Deliberately only four items. */
export const NAV = [
  { href: '/',        en: 'Home',        ja: 'ホーム' },
  { href: '/shop/',   en: 'Online Shop', ja: 'オンラインショップ' },
  { href: '/about/',  en: 'About',       ja: 'アメイアユコについて' },
  { href: '/contact/',en: 'Contact',     ja: 'お問い合わせ' },
] as const;

/** The two fixed product categories. */
export const CATEGORIES = [
  {
    slug: 'album-flake',
    en: 'Album Flake',
    ja: 'アルバムフレーク',
    note: '成長記録やアルバム作りに。鉛筆でもサッと書き込める、やさしい質感の紙モノです。',
  },
  {
    slug: 'stamp',
    en: 'Stamp',
    ja: 'ラバースタンプ',
    note: '押すだけでかわいい手描きスタンプ。毎日の記録づくりがぐっと楽しくなります。',
  },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]['slug'];

export const DEFAULT_CATEGORY: CategorySlug = 'album-flake';

export function isCategorySlug(value: unknown): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}

export function categoryOf(slug: CategorySlug) {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[0];
}

/** News categories, fixed in the schema. */
export const NEWS_CATEGORIES = [
  { slug: 'new-product', label: '新商品' },
  { slug: 'event',       label: 'イベント' },
  { slug: 'info',        label: 'お知らせ' },
  { slug: 'other',       label: 'その他' },
] as const;

export type NewsCategorySlug = (typeof NEWS_CATEGORIES)[number]['slug'];

export function newsCategoryLabel(slug: string): string {
  return NEWS_CATEGORIES.find((c) => c.slug === slug)?.label ?? 'お知らせ';
}

export const NEWS_PER_PAGE = 10;
export const TOP_NEWS_COUNT = 5;

/** Placeholder assets. Replace the files in /public/brand — not these paths. */
export const ASSETS = {
  logo: '/brand/logo.svg',
  /** The header's own mark, top left of every page. */
  headerIcon: '/brand/logo-ayuko.png',
  logoMark: '/brand/logo-mark.svg',
  ogpDefault: '/brand/ogp-default.png',
  heroFallback: '/brand/hero-placeholder.svg',
  avatar: '/brand/profile-ayuko.png',
} as const;

/**
 * The character illustrations that slide in from the screen edges.
 *
 * `from` is part of the artwork, not a layout choice: each one is drawn
 * peeking around the edge it names, so it only reads correctly sliding in
 * from that side. Sizes are the intrinsic ones, for reserving the box.
 */
export const EDGE_DECO = {
  rabbits:    { src: '/brand/deco-left-rabbits.png',       width: 472, height: 709, from: 'left' },
  bearBoy:    { src: '/brand/deco-left-bear-boy.png',      width: 472, height: 709, from: 'left' },
  bearBlack:  { src: '/brand/deco-left-bear-black.png',    width: 354, height: 354, from: 'left' },
  rabbitGirl: { src: '/brand/deco-right-rabbit-girl.png',  width: 472, height: 709, from: 'right' },
  girl:       { src: '/brand/deco-right-girl.png',         width: 472, height: 709, from: 'right' },
  rabbit:     { src: '/brand/deco-right-rabbit.png',       width: 354, height: 354, from: 'right' },
  bear:       { src: '/brand/deco-right-bear.png',         width: 354, height: 354, from: 'right' },
  baby:       { src: '/brand/deco-baby.png',               width: 472, height: 472, from: 'bottom' },
} as const;

/** Path the sync pipeline writes product JSON to (served as a static file). */
export const PRODUCTS_JSON = '/data/products.json';

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '/api').replace(/\/$/, '');

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
