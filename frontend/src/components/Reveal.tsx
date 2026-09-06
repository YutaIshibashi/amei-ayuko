'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** Stagger, in ms. */
  delay?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/**
 * Fades and lifts its children into view on first intersection.
 *
 * Only opacity/transform are animated, and the observer disconnects after the
 * first reveal, so this costs nothing after the initial scroll. Users with
 * `prefers-reduced-motion: reduce` — and anyone without IntersectionObserver —
 * get the content immediately (CSS handles that case too, so there is no
 * flash of hidden content if JS fails entirely).
 */
export default function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className,
  style,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      node.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.classList.add('is-in');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`js-reveal ${className ?? ''}`}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
