import Link from 'next/link';

export interface StatusLink {
  href: string;
  label: string;
  primary?: boolean;
  external?: boolean;
}

/**
 * Shared shell for 404 / 500 / maintenance. Same brand treatment everywhere,
 * so an error never looks like a broken server default.
 */
export default function StatusPage({
  code,
  title,
  message,
  illustration = '/brand/illust-404.svg',
  links,
}: {
  code?: string;
  title: string;
  message: React.ReactNode;
  illustration?: string;
  links: StatusLink[];
}) {
  return (
    <section className="c-status">
      <div className="c-status__inner">
        <img
          className="c-status__illust"
          src={illustration}
          alt=""
          width={400}
          height={320}
          aria-hidden="true"
        />
        {code ? <p className="c-status__code">{code}</p> : null}
        <h1 className="c-status__title">{title}</h1>
        <div className="c-status__text">{message}</div>
        <div className="c-status__links">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.href}
                className={`a-btn ${link.primary ? '' : 'a-btn--ghost'}`}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.href}
                className={`a-btn ${link.primary ? '' : 'a-btn--ghost'}`}
                href={link.href}
              >
                {link.label}
              </Link>
            ),
          )}
        </div>
      </div>
    </section>
  );
}
