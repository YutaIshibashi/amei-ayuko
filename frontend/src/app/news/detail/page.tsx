import type { Metadata } from 'next';
import NewsDetailClient from '@/components/news/NewsDetailClient';

/**
 * Shell for `/news/{id}`.
 *
 * Static export cannot pre-render an unknown set of article ids, so this one
 * exported document (`/news/detail/index.html`) is what Apache serves for every
 * `/news/{id}` request — through `render.php`, which injects the per-article
 * title, description, canonical, OGP and JSON-LD before the HTML goes out.
 *
 * It carries no `robots` of its own, and must not. Stripping a `noindex` from
 * <head> does not remove it from the page: Next.js also serialises this
 * route's metadata into the RSC payload further down the document, and React
 * puts the tag back the moment it hydrates. Google renders before it decides,
 * so a `noindex` here reaches it as a `noindex` on every published article —
 * which is exactly what happened. The shell inherits the root layout's
 * `index, follow, max-image-preview:large`, the same value render.php injects.
 *
 * Keeping `/news/detail/` itself out of the index is Apache's job instead: it
 * 301s to `/news/`, the list this shell stands in for (see public/.htaccess).
 */
export const metadata: Metadata = {
  title: 'お知らせ',
};

export default function NewsDetailPage() {
  return <NewsDetailClient />;
}
