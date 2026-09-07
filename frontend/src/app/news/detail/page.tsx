import type { Metadata } from 'next';
import NewsDetailClient from '@/components/news/NewsDetailClient';

/**
 * Shell for `/news/{id}`.
 *
 * Static export cannot pre-render an unknown set of article ids, so this one
 * exported document (`/news/detail/index.html`) is what Apache serves for every
 * `/news/{id}` request — through `render.php`, which replaces the head with the
 * article's own title, description, canonical, OGP, Twitter card and JSON-LD
 * before the HTML goes out.
 *
 * Which is why the shell declares none of those itself. Next.js serialises a
 * route's resolved metadata into the RSC payload as well as into <head>, and
 * React re-applies it on hydration — so anything named here comes back after
 * the page renders and overwrites, or sits beside, what render.php injected.
 * That is how a `noindex` reached every published article. `null` is the
 * documented way to drop an inherited field, and it takes the value out of the
 * payload too, which leaves the injected head as the only one.
 *
 * `robots` is deliberately still inherited: the root layout's
 * `index, follow, max-image-preview:large` is exactly what render.php injects,
 * so the two agree and there is nothing to contradict.
 *
 * Keeping `/news/detail/` itself out of the index is Apache's job: it 301s to
 * `/news/`, the list this shell stands in for (see public/.htaccess).
 */
export const metadata: Metadata = {
  title: null,
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
};

export default function NewsDetailPage() {
  return <NewsDetailClient />;
}
