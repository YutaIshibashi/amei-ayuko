import { analyticsAllowed } from './consent';

/**
 * GA4 event layer.
 *
 * Two hard rules, enforced here rather than at each call site:
 *  1. gtag.js is never injected before consent is granted.
 *  2. Internal users never emit an event, even with consent granted.
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type GaEventName =
  | 'view_shop'
  | 'select_shop_category'
  | 'view_product'
  | 'click_minne'
  | 'click_instagram'
  | 'view_news'
  | 'click_news_product'
  | 'share_product'
  | 'share_news'
  | 'view_contact'
  | 'submit_contact'
  | 'cookie_consent';

export interface GaParams {
  product_id?: string;
  product_name?: string;
  category?: string;
  price?: number;
  currency?: 'JPY';
  news_id?: number;
  news_category?: string;
  contact_type?: string;
  source?: string;
  destination?: string;
  consent?: 'accepted' | 'rejected';
  method?: string;
  [key: string]: unknown;
}

let loadedId: string | null = null;

/** Injects gtag.js once. Callers must have verified consent first. */
export function loadGa(measurementId: string): void {
  if (typeof window === 'undefined') return;
  if (!measurementId || loadedId === measurementId) return;
  if (!analyticsAllowed()) return;

  loadedId = measurementId;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: true,
    anonymize_ip: true,
    // The app is a client-side SPA shell; page paths are sent explicitly.
    page_path: window.location.pathname + window.location.search,
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
}

/** Stops any further collection after a consent withdrawal. */
export function disableGa(measurementId: string): void {
  if (typeof window === 'undefined' || !measurementId) return;
  // Google's documented opt-out switch; also blocks the already-loaded script.
  (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = true;
}

export function track(name: GaEventName, params: GaParams = {}): void {
  if (typeof window === 'undefined') return;
  if (!analyticsAllowed()) return; // internal users and non-consenters stop here
  window.gtag?.('event', name, params);
}

export function trackPageView(path: string): void {
  if (typeof window === 'undefined') return;
  if (!analyticsAllowed()) return;
  window.gtag?.('event', 'page_view', { page_path: path, page_location: window.location.href });
}

/** Shared product parameter shape, so KPI reports line up across events. */
export function productParams(p: {
  id: string;
  name: string;
  category: string;
  price: number;
}): GaParams {
  return {
    product_id: p.id,
    product_name: p.name,
    category: p.category,
    price: p.price,
    currency: 'JPY',
  };
}
