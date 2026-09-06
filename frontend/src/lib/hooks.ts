'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fetchSettings } from './api';
import { ASSETS, SHOPS, SITE, INSTAGRAM_URL } from './site';
import type { SiteSettings } from './types';

/* ------------------------------------------------------------------ motion */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/**
 * Reads the user's motion preference.
 *
 * `useSyncExternalStore` rather than an effect that calls setState: the media
 * query is an external store, and this is the API for reading one without a
 * render-then-correct pass. It also gives a defined server snapshot, so the
 * static export renders the same thing the client's first render does.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/* ------------------------------------------------------------- scroll lock */

let lockCount = 0;
let savedScrollY = 0;

/**
 * Locks background scrolling while a modal or the mobile menu is open.
 * Reference counted, so nested overlays cannot unlock each other.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const body = document.body;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      // position:fixed is the only reliable lock on iOS Safari.
      body.style.top = `-${savedScrollY}px`;
      body.style.position = 'fixed';
      body.style.width = '100%';
      // Compensate for the disappearing scrollbar on desktop to avoid a shift.
      const gap = window.innerWidth - document.documentElement.clientWidth;
      if (gap > 0) body.style.paddingRight = `${gap}px`;
      body.classList.add('is-locked');
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        body.style.position = '';
        body.style.top = '';
        body.style.width = '';
        body.style.paddingRight = '';
        body.classList.remove('is-locked');
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [active]);
}

/* -------------------------------------------------------------- focus trap */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps Tab focus inside `ref`, restores focus to the previously active
 * element on close, and calls `onEscape` for the Esc key.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const escapeRef = useRef(onEscape);

  // The latest-callback ref is written in an effect rather than during render:
  // a render can be thrown away or replayed under concurrent rendering, and a
  // mutation in the render body would survive that.
  useEffect(() => {
    escapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;

    // The panel is usually portalled to <body>, which mounts a tick after this
    // effect runs — so wait for the node to appear rather than giving up on
    // the first miss. Without this, Escape and Tab trapping silently do
    // nothing for every portalled dialog.
    let raf = 0;
    let attempts = 0;
    const focusFirst = (): void => {
      const node = ref.current;
      if (!node) {
        if (attempts < 30) {
          attempts += 1;
          raf = requestAnimationFrame(focusFirst);
        }
        return;
      }
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    };
    raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const node = ref.current;
      if (!node) return;

      const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement;

      if (e.shiftKey && (current === first || !node.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      returnFocusTo.current?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}

/* ---------------------------------------------------------------- settings */

/** Fallbacks used during the static build and before the API answers. */
export const FALLBACK_SETTINGS: SiteSettings = {
  siteTitle: SITE.name,
  metaDescription: SITE.description,
  ogpImage: ASSETS.ogpDefault,
  ga4MeasurementId: '',
  searchConsoleVerification: '',
  instagramUrl: INSTAGRAM_URL,
  minneUrl: SHOPS[0].url,
  creemaUrl: SHOPS[1].url,
  mercariUrl: SHOPS[2].url,
  inframeUrl: SHOPS[3].url,
  baseUrl: SHOPS[4].url,
  rakumaUrl: SHOPS[5].url,
  copyright: `© ${new Date().getFullYear()} amei ayuko`,
  brandConcept: `${SITE.concept}${SITE.conceptSub}`,
  aboutIntro:
    '3児の子育てのなかで生まれた「こういうの欲しかった！」を、ひとつずつ手描きでカタチにしています。',
  contactIntro:
    'ロゴ・名刺・チラシなどのデザイン制作、商品についてのご質問はこちらからどうぞ。',
  footerCopy: 'ちいさな成長を、かわいく残す。',
  mainVisual: null,
};

let settingsCache: SiteSettings | null = null;
let settingsPromise: Promise<SiteSettings> | null = null;

/**
 * Site settings are editable at runtime, so they are fetched rather than
 * baked into the export. Cached per page load and shared between components.
 */
export function useSettings(): SiteSettings {
  const [settings, setSettings] = useState<SiteSettings>(settingsCache ?? FALLBACK_SETTINGS);

  useEffect(() => {
    // No synchronous setState here even when the cache is already warm: the
    // initial state below already reads it, and anything that filled it after
    // that arrives through the promise instead.
    let alive = true;
    settingsPromise ??= fetchSettings()
      .then((s) => {
        settingsCache = { ...FALLBACK_SETTINGS, ...s };
        return settingsCache;
      })
      .catch(() => FALLBACK_SETTINGS);

    settingsPromise.then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  return settings;
}

/* -------------------------------------------------------------- reveal */

/**
 * Adds `is-in` to elements marked `.js-reveal` once they scroll into view.
 * Falls back to showing everything when IntersectionObserver is unavailable.
 */
export function useRevealObserver(): void {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLElement>('.js-reveal:not(.is-in)');
    if (nodes.length === 0) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  });
}

/* --------------------------------------------------------------- clipboard */

export function useCopyToClipboard(resetMs = 2200): [boolean, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), resetMs);
      return true;
    } catch {
      return false;
    }
  }, [resetMs]);

  return [copied, copy];
}

/** A store that never changes; only its server/client snapshots differ. */
const noopSubscribe = (): (() => void) => () => {};

/**
 * False while rendering on the server (and during the first client render, so
 * hydration matches), true afterwards. Used by anything that must not read
 * browser-only state until the markup has settled.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function subscribeScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  return () => window.removeEventListener('scroll', onChange);
}

/**
 * Whether the page is scrolled past `threshold`.
 *
 * The snapshot is a boolean, so React only re-renders on the crossing rather
 * than on every scroll event.
 */
export function useScrolledPast(threshold: number): boolean {
  const getSnapshot = useCallback(() => window.scrollY > threshold, [threshold]);
  return useSyncExternalStore(subscribeScroll, getSnapshot, () => false);
}
