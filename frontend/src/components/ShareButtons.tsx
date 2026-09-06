'use client';

import { useCallback, useState } from 'react';
import { useCopyToClipboard } from '@/lib/hooks';
import { IconCheck, IconLine, IconLink, IconShare, IconX } from './Icons';

interface ShareButtonsProps {
  url: string;
  title: string;
  /** Reported to GA4 so share sources stay distinguishable. */
  onShared?: (method: string) => void;
  /**
   * `native` prefers the Web Share API with a copy fallback (products);
   * `list` always shows LINE / X / copy (news).
   */
  variant?: 'native' | 'list';
}

/**
 * Share controls.
 *
 * Products use the Web Share API where available — it is the shortest path on
 * mobile, which is where this site is mostly read — and fall back to copying
 * the URL. News articles get explicit LINE / X / copy buttons.
 */
export default function ShareButtons({ url, title, onShared, variant = 'native' }: ShareButtonsProps) {
  const [copied, copy] = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);

  const doCopy = useCallback(async () => {
    const ok = await copy(url);
    setCopyFailed(!ok);
    if (ok) onShared?.('copy');
  }, [copy, url, onShared]);

  const nativeShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        onShared?.('web_share');
        return;
      } catch {
        // AbortError (user cancelled) or an unsupported payload: fall through.
      }
    }
    await doCopy();
  }, [title, url, onShared, doCopy]);

  if (variant === 'native') {
    return (
      <div className="c-share">
        <button
          type="button"
          className={`c-share__btn ${copied ? 'is-done' : ''}`}
          onClick={nativeShare}
        >
          {copied ? <IconCheck width={16} height={16} /> : <IconShare width={16} height={16} />}
          {copied ? 'URLをコピーしました' : 'この商品をシェア'}
        </button>
        {copyFailed ? (
          <span className="c-share__label" role="status">
            コピーできませんでした。URLを選択してコピーしてください。
          </span>
        ) : null}
      </div>
    );
  }

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className="c-share">
      <span className="c-share__label">SHARE</span>
      <a
        className="c-share__btn"
        href={`https://social-plugins.line.me/lineit/share?url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShared?.('line')}
      >
        <IconLine width={16} height={16} />
        LINE
      </a>
      <a
        className="c-share__btn"
        href={`https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onShared?.('x')}
      >
        <IconX width={16} height={16} />
        Xでシェア
      </a>
      <button type="button" className={`c-share__btn ${copied ? 'is-done' : ''}`} onClick={doCopy}>
        {copied ? <IconCheck width={16} height={16} /> : <IconLink width={16} height={16} />}
        {copied ? 'コピーしました' : 'URLをコピー'}
      </button>
    </div>
  );
}
