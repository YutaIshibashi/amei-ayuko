'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { disableGa, loadGa, trackPageView } from '@/lib/analytics';
import { analyticsAllowed, isInternalUser, onConsentChange } from '@/lib/consent';
import { useSettings } from '@/lib/hooks';

/**
 * GA4 bootstrap.
 *
 * gtag.js is injected only once consent is granted and the browser is not
 * flagged internal. Because the site is a static SPA shell, page views for
 * client-side navigations are sent explicitly.
 */
function AnalyticsInner() {
  const { ga4MeasurementId } = useSettings();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstView = useRef(true);

  useEffect(() => {
    if (!ga4MeasurementId) return;
    const sync = () => {
      if (analyticsAllowed()) loadGa(ga4MeasurementId);
      else disableGa(ga4MeasurementId);
    };
    sync();
    return onConsentChange(sync);
  }, [ga4MeasurementId]);

  useEffect(() => {
    if (!ga4MeasurementId) return;
    // The initial view is sent by gtag's own config call.
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    const qs = searchParams.toString();
    trackPageView(pathname + (qs ? `?${qs}` : ''));
  }, [pathname, searchParams, ga4MeasurementId]);

  return null;
}

export default function Analytics() {
  // useSearchParams needs a Suspense boundary during static export.
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}

/**
 * Small badge shown only to internal (excluded) browsers, so it is obvious
 * at a glance that this session is not being counted. Links to the admin
 * screen; the switch itself lives there, never on the public site.
 */
export function AnalyticsOffBadge() {
  const shown = useInternalFlag();
  if (!shown) return null;
  return (
    <a className="c-analyticsBadge" href="/admin/settings/analytics.php">
      <span className="c-analyticsBadge__dot" aria-hidden="true" />
      Analytics OFF
    </a>
  );
}

function useInternalFlag(): boolean {
  const [internal, setInternal] = useState(false);
  useEffect(() => {
    const sync = () => setInternal(isInternalUser());
    sync();
    return onConsentChange(sync);
  }, []);
  return internal;
}
