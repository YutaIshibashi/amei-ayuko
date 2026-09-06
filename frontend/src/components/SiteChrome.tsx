'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import Analytics, { AnalyticsOffBadge } from './Analytics';
import { CookieBanner, CookieSettingsModal } from './CookieConsent';
import Footer from './Footer';
import Header from './Header';

/**
 * The persistent shell around every page: header, footer, consent UI and the
 * analytics bootstrap. Kept as one client component so the layout itself can
 * stay a server component and be fully static.
 */
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const [cookieModalOpen, setCookieModalOpen] = useState(false);
  // Remounts consent-dependent subtrees after a decision, so the banner and
  // the analytics loader react in the same tick.
  const [, setRevision] = useState(0);
  const bumpRevision = useCallback(() => setRevision((v) => v + 1), []);
  // Only the top page has a hero that deliberately sits under the fixed
  // header; every other page needs the header's height reserved.
  const isHome = usePathname() === '/';

  return (
    <>
      <a className="a-skip" href="#main">本文へスキップ</a>
      <Header />
      <main id="main" className={`l-main ${isHome ? '' : 'l-main--offset'}`}>
        {children}
      </main>
      <Footer onOpenCookieSettings={() => setCookieModalOpen(true)} />
      <CookieBanner onDecision={bumpRevision} />
      <CookieSettingsModal
        open={cookieModalOpen}
        onClose={() => setCookieModalOpen(false)}
        onDecision={bumpRevision}
      />
      <Analytics />
      <AnalyticsOffBadge />
    </>
  );
}
