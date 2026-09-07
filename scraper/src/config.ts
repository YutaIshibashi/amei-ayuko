/**
 * Scraper configuration.
 *
 * Everything is read from the environment so the same code runs in GitHub
 * Actions and locally. Secrets never appear in a log line — `describe()` below
 * is what gets printed at start-up.
 */
export interface ScraperConfig {
  /** minne shop URL to crawl, e.g. https://minne.com/@amei-ayuko */
  shopUrl: string;
  /** Site origin hosting the sync API, e.g. https://amei-ayuko.jp */
  siteUrl: string;
  /** Bearer token shared with the PHP endpoints. */
  apiKey: string;
  dryRun: boolean;

  /** Politeness: minimum gap between product page requests. */
  requestDelayMs: number;
  /** Concurrent image downloads. */
  imageConcurrency: number;
  requestTimeoutMs: number;
  maxRetries: number;
  /** Progressive backoff between image retries. */
  retryDelaysMs: number[];
  /** Safety cap so a runaway pagination loop cannot crawl forever. */
  maxListPages: number;
  /** Optional cap on products processed. Used by `--limit N` for smoke tests. */
  maxProducts: number | null;
  userAgent: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export function loadConfig(argv: string[]): ScraperConfig {
  const dryRun = argv.includes('--dry-run');

  // `--limit N` exists so the scraper can be smoke-tested against a couple of
  // real product pages without crawling the whole shop.
  const limitIndex = argv.indexOf('--limit');
  const limitArg = limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Number.NaN;
  const maxProducts = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : null;

  return {
    shopUrl: (process.env.MINNE_SHOP_URL ?? 'https://minne.com/@amei-ayuko').replace(/\/$/, ''),
    siteUrl: (dryRun ? (process.env.SITE_URL ?? 'https://example.invalid') : required('SITE_URL')).replace(/\/$/, ''),
    apiKey: dryRun ? (process.env.MINNE_SYNC_API_KEY ?? 'dry-run') : required('MINNE_SYNC_API_KEY'),
    dryRun,

    // ~1 request per second against minne. This is a courtesy limit, not a
    // performance target: the shop is small and the job runs once a day.
    requestDelayMs: Number(process.env.REQUEST_DELAY_MS ?? 1000),
    imageConcurrency: Number(process.env.IMAGE_CONCURRENCY ?? 3),
    requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 60_000),
    maxRetries: 3,
    retryDelaysMs: [2000, 5000, 10_000],
    maxListPages: Number(process.env.MAX_LIST_PAGES ?? 40),
    maxProducts,
    userAgent:
      process.env.SCRAPER_USER_AGENT ??
      'amei-ayuko-site-sync/1.0 (+https://amei-ayuko.jp; contact via site)',
  };
}

/** Safe to print: no secrets. */
export function describe(config: ScraperConfig): Record<string, unknown> {
  return {
    shopUrl: config.shopUrl,
    siteUrl: config.siteUrl,
    dryRun: config.dryRun,
    requestDelayMs: config.requestDelayMs,
    imageConcurrency: config.imageConcurrency,
    requestTimeoutMs: config.requestTimeoutMs,
    maxProducts: config.maxProducts,
    apiKey: config.apiKey ? '[set]' : '[missing]',
  };
}
