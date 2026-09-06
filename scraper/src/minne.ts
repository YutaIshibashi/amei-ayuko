import * as cheerio from 'cheerio';
import { fetchText, sleep } from './http.js';
import { log } from './log.js';
import type { ScraperConfig } from './config.js';

/**
 * minne scraping.
 *
 * Two structured sources are used, in this order, and plain HTML scraping is
 * only a last resort:
 *
 *  1. `__NEXT_DATA__` — minne is a Next.js app, and the shop listing ships its
 *     own product array (`props.pageProps.products`). That is authoritative:
 *     it contains this shop's products and nothing else, so recommendation
 *     tiles elsewhere on the page cannot leak in.
 *  2. Product JSON-LD on the item page — name, full description, every image
 *     at w1600xh1600, price and availability.
 *
 * When minne changes its markup, these two are the least likely things to
 * move; and if they do move, the sync's validation refuses to publish rather
 * than replacing the catalogue with an empty one.
 */

export interface ListedProduct {
  id: string;
  url: string;
  /** Listing price; used as a fallback when the item page omits it. */
  price: number | null;
  name: string;
  /** minne's own ordering, which the shop preserves. */
  sortOrder: number;
}

export interface ScrapedProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  url: string;
  inStock: boolean;
  imageUrls: string[];
  sortOrder: number;
}

type JsonRecord = Record<string, unknown>;

/* ------------------------------------------------------------------ listing */

/** Walks the shop's paginated listing and returns every product it advertises. */
export async function collectProducts(config: ScraperConfig): Promise<ListedProduct[]> {
  const products: ListedProduct[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= config.maxListPages; page += 1) {
    const listUrl = page === 1 ? config.shopUrl : `${config.shopUrl}?page=${page}`;
    log.info('fetching listing page', { page });

    const html = await fetchText(listUrl, {
      timeoutMs: config.requestTimeoutMs,
      userAgent: config.userAgent,
      attempts: config.maxRetries,
      retryDelaysMs: config.retryDelaysMs,
    });

    const pageProducts = parseListing(html);
    if (pageProducts.length === 0) {
      log.info('listing exhausted', { page });
      break;
    }

    for (const item of pageProducts) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      products.push({ ...item, sortOrder: products.length });
    }

    // Politeness gap between listing pages.
    await sleep(config.requestDelayMs);
  }

  return products;
}

/** Reads `props.pageProps.products` out of the listing's `__NEXT_DATA__`. */
export function parseListing(html: string): Omit<ListedProduct, 'sortOrder'>[] {
  const data = extractNextData(html);
  const pageProps = isRecord(data?.['props']) ? data['props']['pageProps'] : undefined;
  const raw = isRecord(pageProps) ? pageProps['products'] : undefined;

  if (Array.isArray(raw)) {
    const out: Omit<ListedProduct, 'sortOrder'>[] = [];
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      const id = String(entry['id'] ?? '');
      if (!/^\d+$/.test(id)) continue;
      out.push({
        id,
        url: `https://minne.com/items/${id}`,
        price: toPrice(entry['price']),
        name: typeof entry['productName'] === 'string' ? entry['productName'] : '',
      });
    }
    return out;
  }

  // Fallback: scan for item links. Less precise, so it is only reached if
  // minne stops shipping __NEXT_DATA__ at all.
  log.warn('listing __NEXT_DATA__ missing; falling back to link scanning');
  const ids = new Set<string>();
  const $ = cheerio.load(html);
  $('a[href*="/items/"]').each((_, element) => {
    const href = $(element).attr('href');
    const id = href ? productIdFromUrl(href) : null;
    if (id) ids.add(id);
  });
  return [...ids].map((id) => ({
    id,
    url: `https://minne.com/items/${id}`,
    price: null,
    name: '',
  }));
}

export function productIdFromUrl(url: string): string | null {
  return /\/items\/(\d+)/.exec(url)?.[1] ?? null;
}

/* ------------------------------------------------------------------ product */

/**
 * Fetches and parses one product page.
 *
 * Returns null for listings that are not really products — minne shops often
 * carry "please read before ordering" entries, which have no price. Those are
 * skipped rather than published with a price of zero.
 */
export async function scrapeProduct(
  listed: ListedProduct,
  config: ScraperConfig,
): Promise<ScrapedProduct | null> {
  const html = await fetchText(listed.url, {
    timeoutMs: config.requestTimeoutMs,
    userAgent: config.userAgent,
    attempts: config.maxRetries,
    retryDelaysMs: config.retryDelaysMs,
  });

  const $ = cheerio.load(html);
  const jsonLd = extractProductJsonLd($);

  const name =
    stringField(jsonLd?.['name']) ||
    listed.name ||
    ($('meta[property="og:title"]').attr('content') ?? '').replace(/\s*\|\s*minne.*$/i, '').trim();

  const description =
    stringField(jsonLd?.['description']) ||
    $('meta[property="og:description"]').attr('content') ||
    '';

  const offer = firstOffer(jsonLd);
  const price = toPrice(offer?.['price']) ?? listed.price;
  const imageUrls = extractImages($, jsonLd);
  const inStock = detectInStock(offer, $);

  if (price === null) {
    log.info('skipping: no price (not a purchasable listing)', { id: listed.id, name: name.slice(0, 40) });
    return null;
  }
  if (!name || imageUrls.length === 0) {
    log.warn('skipping: required fields missing', {
      id: listed.id,
      hasName: Boolean(name),
      images: imageUrls.length,
    });
    return null;
  }

  return {
    id: listed.id,
    name: name.trim(),
    // minne's description is used verbatim. No attempt is made to split out
    // size or material: that would be brittle, and the site renders the text
    // as-is by design.
    description: description.replace(/\r\n?/g, '\n').trim(),
    price,
    url: listed.url,
    inStock,
    imageUrls,
    sortOrder: listed.sortOrder,
  };
}

/* ------------------------------------------------------------------ parsing */

function extractNextData(html: string): JsonRecord | null {
  const match = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!match?.[1]) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function extractProductJsonLd($: cheerio.CheerioAPI): JsonRecord | null {
  let found: JsonRecord | null = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (found !== null) return;
    const raw = $(element).contents().text();
    if (raw.trim() === '') return;
    try {
      const parsed: unknown = JSON.parse(raw);
      for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!isRecord(candidate)) continue;
        if (candidate['@type'] === 'Product') {
          found = candidate;
          return;
        }
        const graph = candidate['@graph'];
        if (Array.isArray(graph)) {
          const node = graph.find((n) => isRecord(n) && n['@type'] === 'Product');
          if (isRecord(node)) {
            found = node;
            return;
          }
        }
      }
    } catch {
      // A malformed block is not fatal; the remaining sources still apply.
    }
  });

  return found;
}

function firstOffer(jsonLd: JsonRecord | null): JsonRecord | null {
  const offers = jsonLd?.['offers'];
  const offer = Array.isArray(offers) ? offers[0] : offers;
  return isRecord(offer) ? offer : null;
}

/**
 * Product photography, largest available.
 *
 * JSON-LD carries every image as an ImageObject at w1600xh1600 — exactly the
 * size the modal needs — so `<img>` tags are never consulted: on this page
 * they are banners and badges, since the gallery itself renders client-side.
 */
function extractImages($: cheerio.CheerioAPI, jsonLd: JsonRecord | null): string[] {
  const urls: string[] = [];

  const push = (value: unknown): void => {
    let url = '';
    if (typeof value === 'string') url = value;
    else if (isRecord(value)) {
      url = stringField(value['contentUrl']) || stringField(value['url']);
    }
    if (url === '') return;
    const absolute = url.startsWith('//') ? `https:${url}` : url;
    if (!/^https?:\/\//i.test(absolute)) return;
    if (!urls.includes(absolute)) urls.push(absolute);
  };

  const image = jsonLd?.['image'];
  if (Array.isArray(image)) image.forEach(push);
  else if (image !== undefined) push(image);

  if (urls.length === 0) {
    // og:image is a single composite URL, but better than nothing.
    push($('meta[property="og:image"]').attr('content'));
  }

  return urls;
}

function detectInStock(offer: JsonRecord | null, $: cheerio.CheerioAPI): boolean {
  const availability = stringField(offer?.['availability']);
  if (availability !== '') {
    return !/OutOfStock|SoldOut/i.test(availability);
  }
  return !/売り切れ|SOLD\s*OUT|在庫なし/i.test($('body').text());
}

function toPrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '');
    if (digits !== '') {
      const parsed = Number(digits);
      return parsed > 0 ? parsed : null;
    }
  }
  return null;
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isRecord(value)) {
    const url = value['url'];
    if (typeof url === 'string') return url;
  }
  return '';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
