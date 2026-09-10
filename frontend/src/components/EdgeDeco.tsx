'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

interface EdgeDecoProps {
  /** Path under /brand/. */
  src: string;
  /** Intrinsic size of the file, so the box is reserved before it loads. */
  width: number;
  height: number;
  /** Which screen edge it slides in from. */
  from: 'left' | 'right' | 'bottom';
  /** Rendered width at desktop; it scales down with the viewport. */
  size: number;
  /** Offset along the section, e.g. `top="12%"`. */
  top?: string;
  bottom?: string;
  /** Horizontal offset; only the `bottom` variant needs one. */
  left?: string;
  /** Stagger, in ms. */
  delay?: number;
  /** Description for anyone who cannot see it. Decorative art passes ''. */
  alt?: string;
}

/**
 * A character illustration that slides in from the edge of the screen.
 *
 * The artwork is drawn peeking around an edge, so each piece rests flush
 * against the one it is named for and starts fully outside it — sections clip
 * their overflow, which is what hides it until the slide begins.
 *
 * Same contract as Reveal: it moves once, on first intersection, and then the
 * observer disconnects. `prefers-reduced-motion: reduce`, a missing
 * IntersectionObserver and a page with no JS at all each get the illustration
 * already in place rather than an empty gap.
 *
 * The wrapper is what gets observed, and it never moves — only the image
 * inside it does. Observing the image would not work: it starts translated
 * clear of the viewport, so it could never intersect, and the slide that was
 * supposed to bring it in would be the thing waiting for it to arrive.
 */
export default function EdgeDeco({
  src,
  width,
  height,
  from,
  size,
  top,
  bottom,
  left,
  delay = 0,
  alt = '',
}: EdgeDecoProps) {
  const ref = useRef<HTMLDivElement | null>(null);

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
      { rootMargin: '0px 0px -10% 0px', threshold: 0.05 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties = {
    ...(top !== undefined ? { top } : {}),
    ...(bottom !== undefined ? { bottom } : {}),
    ...(left !== undefined ? { left } : {}),
    ['--edge-size' as string]: `${size}px`,
    ['--reveal-delay' as string]: `${delay}ms`,
  };

  return (
    <div ref={ref} className={`c-edgeDeco c-edgeDeco--${from}`} style={style} aria-hidden={alt === ''}>
      {/* `lazy` is safe despite the slide: a transform does not move the
          layout box, so the browser sees the image where it comes to rest and
          loads it as that part of the page approaches. */}
      <img src={src} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
    </div>
  );
}
