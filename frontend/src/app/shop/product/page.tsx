import type { Metadata } from 'next';
import ShopShell from '@/components/shop/ShopShell';

/**
 * Shell for `/shop/?…&product={id}`.
 *
 * The shop's product data is not available during `next build`, so a product
 * URL is served by `render.php`, which replaces the head with that product's
 * title, description, canonical, OGP, Twitter card and Product JSON-LD.
 *
 * It cannot reuse `/shop/`'s own document to do that. Next.js serialises a
 * route's resolved metadata into the RSC payload as well as into <head>, and
 * React re-applies it on hydration — so the shop's title, canonical, OGP and
 * `CollectionPage` graph all came back after the page rendered and replaced
 * the product's. Nulling them on `/shop/` was not an option either: `/shop/`
 * is a real page that needs them.
 *
 * Hence a second document that renders the same shop but declares nothing,
 * exactly as `/news/detail/` does for articles. `robots` stays inherited from
 * the root layout, which is the value render.php injects.
 *
 * Apache 301s this URL to `/shop/`; it exists only to be served under another.
 */
export const metadata: Metadata = {
  title: null,
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
};

export default function ShopProductPage() {
  return <ShopShell />;
}
