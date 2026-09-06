/**
 * Cookie consent + internal-user state.
 *
 * All three flags live in localStorage on the site origin. The admin screen is
 * served from the same origin (`/admin/`), so it can toggle the internal-user
 * and banner-preview flags for that browser directly.
 */
export const CONSENT_KEY = 'amei.consent.v1';
export const INTERNAL_KEY = 'amei.internal.v1';
export const BANNER_PREVIEW_KEY = 'amei.cookie_preview.v1';

/** Consent expires after one year; after that the banner asks again. */
export const CONSENT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export type ConsentStatus = 'accepted' | 'rejected' | 'unset';

export interface ConsentRecord {
  status: 'accepted' | 'rejected';
  timestamp: number;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode / storage disabled: behave as if nothing was ever stored.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readConsent(): ConsentRecord | null {
  const raw = safeGet(CONSENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (parsed.status !== 'accepted' && parsed.status !== 'rejected') return null;
    if (typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > CONSENT_TTL_MS) return null; // expired
    return { status: parsed.status, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

export function consentStatus(): ConsentStatus {
  return readConsent()?.status ?? 'unset';
}

export function writeConsent(status: 'accepted' | 'rejected'): void {
  safeSet(CONSENT_KEY, JSON.stringify({ status, timestamp: Date.now() } satisfies ConsentRecord));
  // A deliberate choice always ends the admin preview mode.
  clearBannerPreview();
  notify();
}

export function clearConsent(): void {
  safeRemove(CONSENT_KEY);
  notify();
}

/** True when this browser is flagged as the owner's / developer's. */
export function isInternalUser(): boolean {
  return safeGet(INTERNAL_KEY) === '1';
}

export function setInternalUser(on: boolean): void {
  if (on) safeSet(INTERNAL_KEY, '1');
  else safeRemove(INTERNAL_KEY);
  notify();
}

/** Admin-only: show the cookie banner to an internal user for a visual check. */
export function isBannerPreview(): boolean {
  return safeGet(BANNER_PREVIEW_KEY) === '1';
}

export function setBannerPreview(on: boolean): void {
  if (on) safeSet(BANNER_PREVIEW_KEY, '1');
  else safeRemove(BANNER_PREVIEW_KEY);
  notify();
}

export function clearBannerPreview(): void {
  safeRemove(BANNER_PREVIEW_KEY);
}

/**
 * Whether the cookie banner should be visible.
 * Internal users never see it unless preview mode is explicitly on.
 */
export function shouldShowBanner(): boolean {
  if (isInternalUser()) return isBannerPreview();
  return consentStatus() === 'unset';
}

/**
 * The single gate for analytics. Internal users are excluded unconditionally —
 * this outranks consent, including while the banner preview is running.
 */
export function analyticsAllowed(): boolean {
  if (isInternalUser()) return false;
  return consentStatus() === 'accepted';
}

/* --- change notification ------------------------------------------------ */

const EVENT = 'amei:consentchange';

function notify(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

export function onConsentChange(handler: () => void): () => void {
  window.addEventListener(EVENT, handler);
  // Another tab (e.g. the admin screen) may flip the flags.
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
