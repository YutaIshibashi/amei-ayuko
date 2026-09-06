'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductImage } from '@/lib/types';
import { IconArrowLeft, IconArrowRight, IconClose } from '../Icons';
import Portal from '../Portal';

/**
 * Product image gallery.
 *
 * One scroll-snapping track serves both breakpoints: on mobile it is a native
 * horizontal swipe, and on desktop the arrows and thumbnails drive the same
 * scroll. That keeps a single source of truth for "which image is showing"
 * and avoids a second JS carousel implementation.
 *
 * Only the first image is eager; the rest — including every large variant —
 * are lazy, which matters because a listing can carry a dozen photos.
 */
export default function Gallery({ images, alt }: { images: ProductImage[]; alt: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState<number | null>(null);

  const count = images.length;

  // Derive the current index from scroll position: works for swipe, arrows
  // and thumbnail clicks alike.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || count <= 1) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const i = Math.round(track.scrollLeft / track.clientWidth);
        setIndex(Math.max(0, Math.min(count - 1, i)));
      });
    };
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [count]);

  const goTo = useCallback((i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(count - 1, i));
    track.scrollTo({
      left: clamped * track.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    setIndex(clamped);
  }, [count]);

  // Esc closes the zoom layer before the modal sees the key.
  useEffect(() => {
    if (zoomed === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoomed(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [zoomed]);

  if (count === 0) {
    return <div className="a-ratio a-ratio--1x1" style={{ borderRadius: 'var(--r-hand)' }} />;
  }

  const zoomImage = zoomed !== null ? images[zoomed] : null;

  return (
    <div className="c-gallery">
      <div className="c-gallery__stage">
        <div
          ref={trackRef}
          className="c-gallery__track"
          role="group"
          aria-roledescription="カルーセル"
          aria-label={`${alt} の商品画像`}
        >
          {images.map((img, i) => (
            <div
              className="c-gallery__slide"
              key={img.large}
              role="group"
              aria-roledescription="スライド"
              aria-label={`${i + 1} / ${count}`}
            >
              <img
                className="c-gallery__img"
                src={img.large}
                alt={img.alt ?? `${alt}（画像${i + 1}）`}
                width={img.width || 1600}
                height={img.height || 1600}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onClick={() => setZoomed(i)}
              />
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <button
              type="button"
              className="c-gallery__arrow c-gallery__arrow--prev"
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
            >
              <span className="a-visuallyHidden">前の画像</span>
              <IconArrowLeft width={18} height={18} />
            </button>
            <button
              type="button"
              className="c-gallery__arrow c-gallery__arrow--next"
              onClick={() => goTo(index + 1)}
              disabled={index === count - 1}
            >
              <span className="a-visuallyHidden">次の画像</span>
              <IconArrowRight width={18} height={18} />
            </button>
            <p className="c-gallery__counter" aria-live="polite">
              {index + 1} / {count}
            </p>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <div className="c-gallery__thumbs" role="tablist" aria-label="商品画像の一覧">
          {images.map((img, i) => (
            <button
              key={img.thumb}
              type="button"
              className="c-gallery__thumb"
              aria-current={i === index}
              onClick={() => goTo(i)}
            >
              <span className="a-visuallyHidden">{`画像${i + 1}を表示`}</span>
              <img src={img.thumb} alt="" width={62} height={62} loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      ) : null}

      {zoomImage ? (
        <Portal>
        <div
          className="c-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${alt}（拡大表示）`}
          onClick={() => setZoomed(null)}
        >
          <button
            type="button"
            className="c-modal__close"
            onClick={(e) => { e.stopPropagation(); setZoomed(null); }}
          >
            <span className="a-visuallyHidden">拡大表示を閉じる</span>
            <IconClose />
          </button>
          <img
            src={zoomImage.large}
            alt={zoomImage.alt ?? alt}
            width={zoomImage.width || 1600}
            height={zoomImage.height || 1600}
            decoding="async"
          />
        </div>
        </Portal>
      ) : null}
    </div>
  );
}
