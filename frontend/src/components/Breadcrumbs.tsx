import Link from 'next/link';

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Visible breadcrumb trail.
 *
 * Only News detail and Privacy Policy show one; Shop, product modals, About
 * and Contact intentionally do not (their BreadcrumbList structured data is
 * still emitted separately where it helps search results).
 */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="c-crumbs" aria-label="パンくずリスト">
      <div className="l-page">
        <ol>
          {items.map((item, i) => {
            const isLast = i === items.length - 1;
            return (
              <li key={`${item.label}-${i}`}>
                {item.href && !isLast ? (
                  <Link href={item.href}>{item.label}</Link>
                ) : (
                  <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
