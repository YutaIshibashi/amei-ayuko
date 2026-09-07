'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { productParams, track } from '@/lib/analytics';
import { formatPrice } from '@/lib/format';
import { useFocusTrap, useScrollLock } from '@/lib/hooks';
import { categoryOf, SITE } from '@/lib/site';
import type { Product } from '@/lib/types';
import { Flower, Sparkle, WaveLine } from '../Deco';
import { IconClose, IconExternal, IconShop } from '../Icons';
import Portal from '../Portal';
import ShareButtons from '../ShareButtons';
import Gallery from './Gallery';

/**
 * Product detail, shown as a modal rather than a page.
 *
 * The URL still changes (`/shop/?category=…&product=…`), so the view is
 * shareable and indexable; `render.php` serves the crawler-facing meta and
 * Product JSON-LD for exactly that URL.
 *
 * Dismissal: close button, backdrop, Esc, and a downward drag on mobile.
 */
export default function ProductModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useScrollLock(true);

  const requestClose = useCallback(() => {
    // Let the exit animation play, unless the user asked for reduced motion.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
      return;
    }
    setClosing(true);
    window.setTimeout(onClose, 160);
  }, [onClose]);

  useFocusTrap(panelRef, true, requestClose);

  useEffect(() => {
    track('view_product', productParams(product));
  }, [product]);

  /* --- swipe down to dismiss (mobile) ---------------------------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (window.innerWidth >= 768) return;
    dragStart.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return;
    setDragY(Math.max(0, e.clientY - dragStart.current));
  };
  const onPointerUp = () => {
    if (dragStart.current === null) return;
    const shouldClose = dragY > 110;
    dragStart.current = null;
    setDragY(0);
    if (shouldClose) requestClose();
  };

  const category = categoryOf(product.category);
  const shareUrl = `${SITE.url}/shop/?category=${product.category}&product=${product.id}`;

  // `position` survives a single remaining button on purpose: the GA4 `source`
  // value stays `product_modal_top`, so the click-through numbers remain
  // comparable with everything recorded before the lower button was removed.
  const buy = (position: 'top') => {
    track('click_minne', { ...productParams(product), source: `product_modal_${position}`, destination: 'minne' });
  };

  return (
    <Portal>
    <div className={`c-modal ${closing ? 'is-closing' : ''}`} role="presentation">
      <button type="button" className="c-modal__backdrop" aria-label="閉じる" onClick={requestClose} />

      <div
        ref={panelRef}
        className="c-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="c-modal__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span className="c-modal__grabBar" />
        </div>

        <button type="button" className="c-modal__close" onClick={requestClose}>
          <span className="a-visuallyHidden">商品の詳細を閉じる</span>
          <IconClose />
        </button>

        <div className="c-modal__scroll">
          <Flower className="c-deco" style={{ top: '8%', right: '2%', color: 'var(--c-brand-soft)', opacity: 0.35 }} width={64} />
          <Sparkle className="c-deco" style={{ bottom: '6%', left: '2%', color: 'var(--c-sun)', opacity: 0.4 }} width={26} />

          <div className="c-modal__layout">
            <div className="c-modal__sticky">
              <Gallery images={product.images} alt={product.name} />
            </div>

            <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
              <div>
                <span className="a-tag">{category.ja}</span>
                <h2 className="c-modal__title" id="product-modal-title" style={{ marginTop: 'var(--s-3)' }}>
                  {product.name}
                </h2>
                <WaveLine style={{ marginTop: 'var(--s-2)', color: 'var(--c-brand-soft)' }} width={120} />
              </div>

              <p className="c-modal__price">
                {formatPrice(product.price)}
                {!product.inStock ? <small>現在minneでは在庫切れです</small> : null}
              </p>

              {/* The single purchase CTA, above the description. */}
              <div className="c-modal__actions">
                <a
                  className="a-btn a-btn--lg a-btn--block"
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => buy('top')}
                >
                  <IconShop width={20} height={20} />
                  minneで購入する
                  <IconExternal width={16} height={16} aria-hidden="true" />
                </a>
                <p className="c-modal__buyNote">
                  ご購入・お支払い・発送はminneのページで行われます。
                </p>
              </div>

              <div className="c-modal__descBox">
                <h3 className="a-enTitle" style={{ fontSize: 'var(--fs-lg)', marginBottom: 'var(--s-3)' }}>
                  Description
                </h3>
                {/* minne's own description text, rendered verbatim as plain text. */}
                <p className="c-modal__desc">{product.description}</p>
              </div>

              <div className="c-modal__meta">
                <ShareButtons
                  url={shareUrl}
                  title={`${product.name} | ${SITE.name}`}
                  onShared={(method) => track('share_product', { ...productParams(product), method })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
