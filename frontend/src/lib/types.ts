import type { CategorySlug } from './site';

/** A product as published by the sync pipeline into /data/products.json. */
export interface Product {
  /** minne product id — also the public URL key and the image directory name. */
  id: string;
  name: string;
  /** minne's description, verbatim. Rendered as pre-wrapped plain text. */
  description: string;
  price: number;
  currency: 'JPY';
  category: CategorySlug;
  /** True when an admin pinned the category by hand (sync must not override). */
  categoryOverridden?: boolean;
  /** minne product page — the purchase destination. */
  url: string;
  inStock: boolean;
  images: ProductImage[];
  /** Position in minne's own listing; the shop preserves this order. */
  sortOrder: number;
  updatedAt: string;
}

export interface ProductImage {
  /** ~600px wide WebP, used in the grid. */
  thumb: string;
  /** ~1600px wide WebP, used in the modal / lightbox. */
  large: string;
  width: number;
  height: number;
  alt?: string;
}

export interface ProductsPayload {
  generatedAt: string;
  syncId: string;
  products: Product[];
}

export type NewsStatus = 'draft' | 'scheduled' | 'published' | 'private';

/** A news article as returned by the public API (published items only). */
export interface NewsItem {
  id: number;
  title: string;
  category: string;
  publishedAt: string;
  /** Only set when the article was edited after publication. */
  updatedAt: string | null;
  image: NewsImage | null;
  excerpt: string;
}

export interface NewsImage {
  url: string;
  width: number;
  height: number;
}

export interface NewsDetail extends NewsItem {
  /** Server-sanitised HTML (allow-list). Safe to inject. */
  body: string;
  relatedProduct: RelatedProduct | null;
}

export interface RelatedProduct {
  id: string;
  name: string;
  category: CategorySlug;
  thumb: string | null;
  price: number;
}

export interface NewsListResponse {
  items: NewsItem[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/** Editable site settings delivered by /api/settings.php. */
export interface SiteSettings {
  siteTitle: string;
  metaDescription: string;
  ogpImage: string;
  ga4MeasurementId: string;
  searchConsoleVerification: string;
  instagramUrl: string;
  minneUrl: string;
  creemaUrl: string;
  mercariUrl: string;
  inframeUrl: string;
  baseUrl: string;
  rakumaUrl: string;
  copyright: string;
  brandConcept: string;
  aboutIntro: string;
  contactIntro: string;
  footerCopy: string;
  mainVisual: string | null;
}

export interface ContactType {
  id: number;
  label: string;
  helpText: string;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string>;
}
