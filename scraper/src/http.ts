import { request, type Dispatcher } from 'undici';
import { log } from './log.js';

/**
 * Session cookie jar.
 *
 * minne answers the first request with a 307 to `?_session_init=1` and a
 * Set-Cookie; without carrying that cookie forward every subsequent request
 * bounces the same way and no HTML is ever returned. A single shared jar is
 * enough here — the scraper only ever talks to one origin.
 */
const cookieJar = new Map<string, string>();

function rememberCookies(headers: Record<string, string | string[] | undefined>): void {
  const raw = headers['set-cookie'];
  if (!raw) return;
  for (const entry of Array.isArray(raw) ? raw : [raw]) {
    const pair = entry.split(';', 1)[0];
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeader(): string {
  return [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ');
}

export function clearCookies(): void {
  cookieJar.clear();
}

export interface FetchOptions {
  timeoutMs: number;
  userAgent: string;
  /** Total attempts, including the first. */
  attempts?: number;
  /** Delay before attempt 2, 3, … */
  retryDelaysMs?: number[];
  accept?: string;
}

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A GET with progressive backoff.
 *
 * 4xx responses are not retried — they are answers, not failures. 5xx,
 * timeouts and transport errors are, with a small random jitter added to the
 * configured delays so parallel workers do not line up and hit the origin in
 * lockstep after a hiccup.
 */
async function withRetry<T>(
  label: string,
  attempts: number,
  delays: number[],
  fn: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error instanceof HttpError ? error.status : 0;
      if (status >= 400 && status < 500) throw error;
      if (attempt === attempts) break;

      const base = delays[attempt - 1] ?? delays[delays.length - 1] ?? 2000;
      const jitter = Math.floor(Math.random() * 500);
      log.warn(`retrying ${label}`, { attempt, waitMs: base + jitter, status });
      await sleep(base + jitter);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

/**
 * One GET, following redirects by hand so cookies set on an intermediate hop
 * are carried into the next one. undici's own `maxRedirections` drops them,
 * which is exactly what minne's session bootstrap depends on.
 */
async function getOnce(
  url: string,
  options: FetchOptions,
  binary: boolean,
  depth = 0,
): Promise<{ text: string; buffer: Buffer }> {
  const cookies = cookieHeader();
  const res = await request(url, {
    method: 'GET',
    headers: {
      'user-agent': options.userAgent,
      accept: options.accept ?? (binary
        ? 'image/avif,image/webp,image/*,*/*;q=0.8'
        : 'text/html,application/xhtml+xml'),
      'accept-language': 'ja,en;q=0.8',
      ...(cookies === '' ? {} : { cookie: cookies }),
    },
    headersTimeout: options.timeoutMs,
    bodyTimeout: options.timeoutMs,
  });

  rememberCookies(res.headers as Record<string, string | string[] | undefined>);

  if (res.statusCode >= 300 && res.statusCode < 400) {
    const location = res.headers['location'];
    await res.body.dump();
    if (typeof location !== 'string' || depth >= 5) {
      throw new HttpError(`GET ${url} → ${res.statusCode} (no usable redirect)`, res.statusCode);
    }
    return getOnce(new URL(location, url).toString(), options, binary, depth + 1);
  }

  if (res.statusCode >= 400) {
    // Drain so the connection can be reused.
    await res.body.dump();
    throw new HttpError(`GET ${url} → ${res.statusCode}`, res.statusCode);
  }

  if (binary) {
    return { text: '', buffer: Buffer.from(await res.body.arrayBuffer()) };
  }
  return { text: await res.body.text(), buffer: Buffer.alloc(0) };
}

export async function fetchText(url: string, options: FetchOptions): Promise<string> {
  const result = await withRetry(
    url,
    options.attempts ?? 3,
    options.retryDelaysMs ?? [2000, 5000, 10_000],
    () => getOnce(url, options, false),
  );
  return result.text;
}

export async function fetchBinary(url: string, options: FetchOptions): Promise<Buffer> {
  const result = await withRetry(
    url,
    options.attempts ?? 3,
    options.retryDelaysMs ?? [2000, 5000, 10_000],
    () => getOnce(url, options, true),
  );
  return result.buffer;
}

export type { Dispatcher };
