import { API_BASE, PRODUCTS_JSON } from './site';
import type {
  ContactType,
  NewsDetail,
  NewsListResponse,
  ProductsPayload,
  SiteSettings,
} from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Thin fetch wrapper. The static bundle talks to PHP over same-origin
 * relative URLs, so no CORS and no credentials handling is required.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('通信に失敗しました。電波の良い場所で、もう一度お試しください。', 0);
  }

  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const body: unknown = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const parsed = body as { message?: string; fields?: Record<string, string> } | null;
    throw new ApiError(
      parsed?.message ?? 'エラーが発生しました。時間をおいてお試しください。',
      res.status,
      parsed?.fields,
    );
  }
  return body as T;
}

/**
 * Products are a plain static JSON file swapped atomically by the sync
 * pipeline, so it is cheap to fetch and cacheable at the edge.
 */
export function fetchProducts(signal?: AbortSignal): Promise<ProductsPayload> {
  return request<ProductsPayload>(PRODUCTS_JSON, { signal, cache: 'no-cache' });
}

export function fetchNewsList(page: number, signal?: AbortSignal): Promise<NewsListResponse> {
  const qs = new URLSearchParams({ page: String(page) });
  return request<NewsListResponse>(`${API_BASE}/news/index.php?${qs}`, { signal });
}

export function fetchNewsDetail(id: number, signal?: AbortSignal): Promise<NewsDetail> {
  const qs = new URLSearchParams({ id: String(id) });
  return request<NewsDetail>(`${API_BASE}/news/detail.php?${qs}`, { signal });
}

export function fetchSettings(signal?: AbortSignal): Promise<SiteSettings> {
  return request<SiteSettings>(`${API_BASE}/settings.php`, { signal });
}

export function fetchContactTypes(signal?: AbortSignal): Promise<{ types: ContactType[] }> {
  return request<{ types: ContactType[] }>(`${API_BASE}/contact-types.php`, { signal });
}

export interface ContactPayload {
  name: string;
  email: string;
  emailConfirm: string;
  contactTypeId: number;
  message: string;
  agree: boolean;
  turnstileToken: string;
  /** Honeypot — must stay empty. */
  website: string;
  csrfToken: string;
}

export function fetchCsrfToken(signal?: AbortSignal): Promise<{ token: string }> {
  return request<{ token: string }>(`${API_BASE}/csrf.php`, { signal, credentials: 'same-origin' });
}

export function submitContact(payload: ContactPayload, signal?: AbortSignal): Promise<{ ok: true }> {
  return request<{ ok: true }>(`${API_BASE}/contact.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
    signal,
  });
}
