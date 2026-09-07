import { Agent, fetch, FormData } from 'undici';
import { sleep } from './http.js';
import { log } from './log.js';
import type { ScraperConfig } from './config.js';

/**
 * Client for the PHP sync API.
 *
 * The bearer token is sent on every call and never logged (see log.ts's
 * `registerSecret`). All endpoints are same-site over HTTPS.
 *
 * Two things here are deliberate, and both were learned from a failed run:
 *
 * 1. **HTTP/1.1 only.** undici 8 enables HTTP/2 by default (undici 7 did not).
 *    Uploading multipart to Lolipop over h2 produced
 *    `NGHTTP2_PROTOCOL_ERROR` mid-run. The dispatcher below is scoped to this
 *    client, so minne's GET traffic keeps the global dispatcher and is
 *    unaffected.
 *
 * 2. **`fetch`, not `request`.** undici 8 dropped FormData serialisation from
 *    `request()`: it accepts the body, never encodes it, and the request hangs
 *    until the server times out. `fetch()` is the API that serialises
 *    multipart, and it sets the boundary itself — which is why no Content-Type
 *    is set by hand anywhere below.
 */

/** Attempt 1 is immediate; these are the waits before attempts 2 and 3. */
const IMAGE_RETRY_DELAYS_MS = [2000, 5000] as const;
export interface StartResponse {
  syncId: string;
  previousSuccess: string | null;
  previousCount: number;
}

export interface CommitResponse {
  ok: true;
  syncId: string;
  total: number;
  added: number;
  removed: number;
  addedIds: string[];
  removedIds: string[];
}

export interface ProductPayload {
  id: string;
  name: string;
  description: string;
  price: number;
  url: string;
  inStock: boolean;
  sortOrder: number;
  images: { thumb: string; large: string }[];
}

export class SyncApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: string) {
    super(message);
    this.name = 'SyncApiError';
  }
}

/**
 * Whether an upload failure is worth another attempt.
 *
 * 4xx is an answer, not a failure: a rejected filename or a bad token will be
 * rejected identically every time, and retrying only delays the real error.
 * 5xx and transport-level failures (a dropped connection, a timeout, a TLS
 * reset) are the transient ones worth repeating.
 */
export function isRetriableUploadError(error: unknown): boolean {
  if (error instanceof SyncApiError) {
    return error.status >= 500;
  }
  // Everything else reaching here is a transport or timeout error: undici
  // surfaces those as TypeError with a `cause`, and aborts as DOMException.
  return true;
}

/** A short, safe description for the retry log. Never includes a response body. */
export function describeUploadError(error: unknown): string {
  if (error instanceof SyncApiError) {
    return `HTTP ${error.status}`;
  }
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    const causeCode =
      cause instanceof Error
        ? ((cause as { code?: string }).code ?? cause.name)
        : undefined;
    return causeCode ? `${error.name}: ${causeCode}` : error.name;
  }
  return 'unknown error';
}

export class SyncClient {
  private readonly dispatcher: Agent;

  constructor(private readonly config: ScraperConfig) {
    this.dispatcher = new Agent({
      // The whole point: never negotiate h2 for the sync API. Scoped to this
      // client rather than set globally, so minne's traffic is untouched.
      allowH2: false,
      headersTimeout: config.requestTimeoutMs,
      bodyTimeout: config.requestTimeoutMs,
      connect: { timeout: config.requestTimeoutMs },
    });
  }

  /** Releases the sockets this client opened. */
  async close(): Promise<void> {
    await this.dispatcher.close();
  }

  private endpoint(path: string): string {
    return `${this.config.siteUrl}/api/sync/${path}`;
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.config.apiKey}`, accept: 'application/json' };
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.endpoint(path), {
      method: 'POST',
      headers: { ...this.authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      dispatcher: this.dispatcher,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new SyncApiError(`POST ${path} → ${res.status}`, res.status, text);
    }
    return JSON.parse(text) as T;
  }

  start(): Promise<StartResponse> {
    return this.postJson<StartResponse>('start.php', {});
  }

  sendProducts(syncId: string, products: ProductPayload[]): Promise<{ ok: true; staged: number; uncategorized: number }> {
    return this.postJson('products.php', { syncId, products });
  }

  /**
   * Uploads one converted WebP as multipart/form-data.
   *
   * The only call that retries. An image upload is a large body over a long
   * run — hundreds of them — so a single dropped connection should not throw
   * away the whole sync. `start` and `commit` deliberately do not retry: a
   * repeated `start` would leave orphan sessions, and a repeated `commit`
   * would risk publishing twice.
   *
   * Re-sending is safe because the server writes to a path derived entirely
   * from (syncId, productId, filename) and overwrites it, so attempt 2 lands
   * exactly where attempt 1 would have. See SyncService::stageImage().
   */
  async sendImage(
    syncId: string,
    productId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    const attempts = IMAGE_RETRY_DELAYS_MS.length + 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.postImage(syncId, productId, filename, buffer);
        return;
      } catch (error) {
        const isLast = attempt === attempts;
        if (isLast || !isRetriableUploadError(error)) {
          throw error;
        }

        const waitMs = IMAGE_RETRY_DELAYS_MS[attempt - 1] ?? 5000;
        // Only identifiers: never the token, never the image, never the
        // response body — a server error can echo back whatever it likes.
        log.warn('retrying image upload', {
          productId,
          filename,
          attempt,
          of: attempts,
          waitMs,
          reason: describeUploadError(error),
        });
        await sleep(waitMs);
      }
    }
  }

  /** One upload attempt. The form is rebuilt per attempt so the body is fresh. */
  private async postImage(
    syncId: string,
    productId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    const form = new FormData();
    form.set('syncId', syncId);
    form.set('productId', productId);
    form.set('filename', filename);
    // No Content-Type header anywhere: fetch derives it, including the
    // boundary. Setting it by hand is how multipart bodies get corrupted.
    form.set('file', new Blob([new Uint8Array(buffer)], { type: 'image/webp' }), filename);

    const res = await fetch(this.endpoint('image.php'), {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
      dispatcher: this.dispatcher,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new SyncApiError(`POST image.php → ${res.status}`, res.status, text);
    }
  }

  commit(
    syncId: string,
    stats: { imageSuccess: number; imageFailure: number; mainImageFailure: number },
  ): Promise<CommitResponse> {
    return this.postJson<CommitResponse>('commit.php', { syncId, ...stats });
  }

  /**
   * Releases the staging area.
   *
   * Best-effort by design for a failed sync: it is already on its way to
   * reporting an error, and the server sweeps stale runs after 24 hours
   * anyway — so a failed abort must not replace the real cause.
   *
   * The return value exists for callers whose whole premise is that nothing
   * is left behind (the upload smoke test), which cannot treat a suppressed
   * failure as success.
   *
   * @returns whether the server confirmed the abort
   */
  async abort(syncId: string, reason: string): Promise<boolean> {
    try {
      await this.postJson('abort.php', { syncId, reason });
      return true;
    } catch (error) {
      log.warn('abort request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}
