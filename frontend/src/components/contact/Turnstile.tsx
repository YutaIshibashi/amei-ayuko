'use client';

import { useEffect, useId, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';

let scriptPromise: Promise<void> | null = null;

/** Loads the Turnstile script once, on demand, for the whole page. */
function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    window.onTurnstileLoad = () => resolve();
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error('turnstile script failed'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile widget.
 *
 * Rendered explicitly (rather than by auto-scan) so the third-party script is
 * only fetched on the contact page, and never on first paint of the site.
 * The token is short-lived, so `resetSignal` lets the form request a fresh one
 * after a failed submission.
 */
export default function Turnstile({
  siteKey,
  onToken,
  onError,
  resetSignal = 0,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
  resetSignal?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const domId = useId();
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          language: 'ja',
          theme: 'light',
          callback: (token: string) => onTokenRef.current(token),
          'error-callback': () => onErrorRef.current?.(),
          'expired-callback': () => onTokenRef.current(''),
          'timeout-callback': () => onTokenRef.current(''),
        });
      })
      .catch(() => onErrorRef.current?.());

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal > 0 && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  if (!siteKey) {
    // Missing configuration must be obvious in development and harmless in
    // production — the server rejects any submission without a valid token.
    return (
      <p className="c-field__help" role="status">
        スパム対策の読み込み設定が未完了です。送信できない場合はInstagramのDMからご連絡ください。
      </p>
    );
  }

  return <div ref={holder} id={`turnstile-${domId}`} />;
}
