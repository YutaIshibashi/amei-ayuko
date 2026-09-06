import type { Metadata } from 'next';
import NewsDetailClient from '@/components/news/NewsDetailClient';

/**
 * Shell for `/news/{id}`.
 *
 * Static export cannot pre-render an unknown set of article ids, so this one
 * exported document (`/news/detail/index.html`) is what Apache serves for every
 * `/news/{id}` request — through `render.php`, which injects the per-article
 * title, description, canonical, OGP and JSON-LD before the HTML goes out.
 * The route is excluded from indexing itself; the injected canonical points at
 * the real `/news/{id}` URL.
 */
export const metadata: Metadata = {
  title: 'お知らせ',
  robots: { index: false, follow: true },
};

export default function NewsDetailPage() {
  return <NewsDetailClient />;
}
