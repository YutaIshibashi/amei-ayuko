'use client';

import { createPortal } from 'react-dom';
import { useMounted } from '@/lib/hooks';

/**
 * Renders children into `document.body`.
 *
 * Overlays must not inherit the stacking context of wherever they happen to be
 * declared. Section wrappers here carry `position: relative; z-index: 1` to
 * lift content above the decorative illustrations, and that is enough to trap
 * a `position: fixed` dialog beneath the cookie banner — regardless of the
 * dialog's own z-index, because the whole subtree is composited as one layer.
 *
 * Portalling to the body sidesteps the problem for good, rather than leaving a
 * z-index number that only works from certain call sites.
 */
export default function Portal({ children }: { children: React.ReactNode }) {
  // `document` does not exist during the static export, and the first client
  // render has to match the prerendered output, so the portal opens one tick
  // later. Consumers must tolerate that (see useFocusTrap, which waits for the
  // portalled node to appear).
  const mounted = useMounted();

  if (!mounted) return null;
  return createPortal(children, document.body);
}
