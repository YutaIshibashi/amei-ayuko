import { Suspense } from 'react';
import ShopClient from './ShopClient';

/**
 * The shop's body, shared by the two documents that render it: `/shop/` and
 * the metadata-free shell `render.php` serves for `/shop/?…&product={id}`.
 *
 * Everything here is driven from the URL client-side, so the same markup works
 * whichever of the two the browser was given.
 */
export default function ShopShell() {
  return (
    // useSearchParams requires a Suspense boundary under static export.
    <Suspense fallback={<ShopFallback />}>
      <ShopClient />
    </Suspense>
  );
}

function ShopFallback() {
  return (
    <section className="l-section l-section--cream">
      <div className="l-page">
        <div className="c-pageHead">
          <span className="c-pageHead__en">Online Shop</span>
          <h1 className="c-pageHead__jp">オンラインショップ</h1>
        </div>
        <ul className="c-grid" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="c-skeleton c-skeleton__card" />
          ))}
        </ul>
      </div>
    </section>
  );
}
