'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSettings } from './api';
import { ASSETS, SHOPS, SITE, INSTAGRAM_URL } from './site';
import type { SiteSettings } from './types';

/* ------------------------------------------------------------------ motion */

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
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
  escapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;

    // Move focus in on the next frame, once the panel has been painted.
    const raf = requestAnimationFrame(() => {
      const first = node.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? node).focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        escapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;

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
    if (settingsCache) {
      setSettings(settingsCache);
      return;
    }
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

/** Avoids the hydration mismatch for anything that reads browser-only state. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
