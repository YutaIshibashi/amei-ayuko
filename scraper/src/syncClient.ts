import { request } from 'undici';
import { log } from './log.js';
import type { ScraperConfig } from './config.js';

/**
 * Client for the PHP sync API.
 *
 * The bearer token is sent on every call and never logged (see log.ts's
 * `registerSecret`). All endpoints are same-site over HTTPS.
 */
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

export class SyncClient {
  constructor(private readonly config: ScraperConfig) {}

  private endpoint(path: string): string {
    return `${this.config.siteUrl}/api/sync/${path}`;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await request(this.endpoint(path), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      headersTimeout: this.config.requestTimeoutMs,
      bodyTimeout: this.config.requestTimeoutMs,
    });

    const text = await res.body.text();
    if (res.statusCode >= 400) {
      throw new SyncApiError(`POST ${path} → ${res.statusCode}`, res.statusCode, text);
    }
    return JSON.parse(text) as T;
  }

  start(): Promise<StartResponse> {
    return this.postJson<StartResponse>('start.php', {});
  }

  sendProducts(syncId: string, products: ProductPayload[]): Promise<{ ok: true; staged: number; uncategorized: number }> {
    return this.postJson('products.php', { syncId, products });
  }

  /** Uploads one converted WebP as multipart/form-data. */
  async sendImage(
    syncId: string,
    productId: string,
    filename: string,
    buffer: Buffer,
  ): Promise<void> {
    const form = new FormData();
    form.set('syncId', syncId);
    form.set('productId', productId);
    form.set('filename', filename);
    form.set('file', new Blob([new Uint8Array(buffer)], { type: 'image/webp' }), filename);

    const res = await request(this.endpoint('image.php'), {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.apiKey}`, accept: 'application/json' },
      body: form,
      headersTimeout: this.config.requestTimeoutMs,
      bodyTimeout: this.config.requestTimeoutMs,
    });

    const text = await res.body.text();
    if (res.statusCode >= 400) {
      throw new SyncApiError(`POST image.php → ${res.statusCode}`, res.statusCode, text);
    }
  }

  commit(
    syncId: string,
    stats: { imageSuccess: number; imageFailure: number; mainImageFailure: number },
  ): Promise<CommitResponse> {
    return this.postJson<CommitResponse>('commit.php', { syncId, ...stats });
  }

  async abort(syncId: string, reason: string): Promise<void> {
    try {
      await this.postJson('abort.php', { syncId, reason });
    } catch (error) {
      // Abort is best-effort: the server sweeps stale runs after 24h anyway.
      log.warn('abort request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
