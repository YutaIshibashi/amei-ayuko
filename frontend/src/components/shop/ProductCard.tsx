'use client';

import { memo } from 'react';
import { formatPrice } from '@/lib/format';
import type { Product } from '@/lib/types';

/**
 * Product card — image, name, price and nothing else, per the shop's
 * "minimum information" rule. It is a button, not a link: opening the modal
 * is what happens, and the URL is updated by the shop container.
 */
function ProductCardBase({
  product,
  onOpen,
  priority,
}: {
  product: Product;
  onOpen: (product: Product, element: HTMLElement) => void;
  /** The first row is above the fold, so those images are not lazy. */
  priority: boolean;
}) {
  const cover = product.images[0];

  return (
    <li className="c-pcard">
      <button
        type="button"
        className="c-pcard__btn"
        data-product-id={product.id}
        onClick={(e) => onOpen(product, e.currentTarget)}
        aria-haspopup="dialog"
      >
        <span className="a-ratio a-ratio--1x1">
          {cover ? (
            <img
              className="c-pcard__img"
              src={cover.thumb}
              alt={product.name}
              width={600}
              height={600}
              loading={priority ? 'eager' : 'lazy'}
              fetchPriority={priority ? 'high' : 'auto'}
              decoding="async"
            />
          ) : null}
        </span>
        <span className="c-pcard__body">
          <span className="c-pcard__name">{product.name}</span>
          <span className="c-pcard__price">
            {formatPrice(product.price)}
            {!product.inStock ? <small>（在庫切れ）</small> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

export default memo(ProductCardBase);
