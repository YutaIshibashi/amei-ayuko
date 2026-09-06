/**
 * Hand-drawn decorative artwork.
 *
 * These are inline SVGs so they can inherit brand colours and animate with
 * transform/opacity only. They are placeholders in the sense that any of them
 * can be swapped for a scan of the real illustrations by replacing the file —
 * the call sites only reference the component name and a position class.
 */
import type { CSSProperties } from 'react';

interface DecoProps {
  className?: string;
  style?: CSSProperties;
  width?: number;
}

const hidden = { 'aria-hidden': true as const, focusable: 'false' as const };

/** Soft cloud shape used behind headings. */
export function Cloud({ className, style, width = 160 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 160 84" fill="none">
      <path
        d="M32 70c-13 0-23-9-23-21S19 28 32 28c2-13 13-22 27-22 12 0 22 7 26 17 3-2 6-3 10-3 11 0 19 8 19 18 0 1 0 2-.2 3 9 2 15 9 15 17 0 7-6 12-14 12H32Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Wavy hand-drawn rule. */
export function WaveLine({ className, style, width = 200 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 200 16" fill="none">
      <path
        d="M2 9c8-8 16-8 24 0s16 8 24 0 16-8 24 0 16 8 24 0 16-8 24 0 16 8 24 0 16-8 24 0"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Full-width wave used as a section divider. */
export function WaveDivider({ className, flip = false, color = 'var(--c-cream)' }: { className?: string; flip?: boolean; color?: string }) {
  return (
    <svg
      {...hidden}
      className={`c-wave ${className ?? ''}`}
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}
    >
      <path
        d="M0 34c96-22 192-30 288-14s192 46 288 44 192-32 288-42 192 0 288 16 192 22 288 12v14H0V34Z"
        fill={color}
      />
    </svg>
  );
}

/** A four-petal flower — recurring motif in the brand illustrations. */
export function Flower({ className, style, width = 64 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 64 64" fill="none">
      <g fill="currentColor">
        <ellipse cx="32" cy="16" rx="10" ry="13" />
        <ellipse cx="32" cy="48" rx="10" ry="13" />
        <ellipse cx="16" cy="32" rx="13" ry="10" />
        <ellipse cx="48" cy="32" rx="13" ry="10" />
      </g>
      <circle cx="32" cy="32" r="8" fill="var(--c-sun)" />
    </svg>
  );
}

/** Small star / sparkle. */
export function Sparkle({ className, style, width = 28 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 28 28" fill="none">
      <path d="M14 1c1.2 6.4 6.4 11.6 12.8 12.8C20.4 15 15.2 20.2 14 26.6 12.8 20.2 7.6 15 1.2 13.8 7.6 12.6 12.8 7.4 14 1Z" fill="currentColor" />
    </svg>
  );
}

/** Heart. */
export function Heart({ className, style, width = 32 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 32 30" fill="none">
      <path d="M16 28S2 19.6 2 10.6C2 5.9 5.8 2.4 10.2 2.4c2.4 0 4.6 1.1 5.8 2.9 1.2-1.8 3.4-2.9 5.8-2.9C26.2 2.4 30 5.9 30 10.6 30 19.6 16 28 16 28Z" fill="currentColor" />
    </svg>
  );
}

/** Crayon-ish scribble blob used as a background wash. */
export function Blob({ className, style, width = 260 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 260 230" fill="none">
      <path
        d="M53 32c26-24 76-36 116-24s61 44 66 82-14 74-46 96-82 24-116 4S6 128 12 96s15-40 41-64Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Dotted, hand-drawn arc used to connect sections. */
export function DottedArc({ className, style, width = 180 }: DecoProps) {
  return (
    <svg {...hidden} className={className} style={style} width={width} viewBox="0 0 180 60" fill="none">
      <path
        d="M4 52C30 12 76 2 118 12c24 6 42 20 58 40"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 12"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- pillars */

/** Pictograms for the four concept pillars. */
export function PillarIcon({ kind, className }: { kind: 'mom' | 'hand' | 'growth' | 'easy'; className?: string }) {
  const common = { ...hidden, className, width: 62, height: 62, viewBox: '0 0 62 62', fill: 'none' as const };
  switch (kind) {
    case 'mom':
      return (
        <svg {...common}>
          <circle cx="31" cy="31" r="29" fill="var(--c-berry-wash)" />
          <circle cx="24" cy="25" r="7" fill="var(--c-brand)" />
          <circle cx="40" cy="29" r="5" fill="var(--c-berry)" />
          <path d="M12 48c2-8 7-12 12-12s10 4 12 12" stroke="var(--c-brand)" strokeWidth="3" strokeLinecap="round" />
          <path d="M33 48c1.6-6 4.6-9 7-9s5.4 3 7 9" stroke="var(--c-berry)" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case 'hand':
      return (
        <svg {...common}>
          <circle cx="31" cy="31" r="29" fill="var(--c-sun-wash)" />
          <path d="M18 42 40 20l6 6-22 22-8 2 2-8Z" fill="var(--c-sun)" stroke="var(--c-ink)" strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M37 23l6 6" stroke="var(--c-ink)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'growth':
      return (
        <svg {...common}>
          <circle cx="31" cy="31" r="29" fill="var(--c-mint-wash)" />
          <path d="M16 44h30" stroke="var(--c-mint)" strokeWidth="3" strokeLinecap="round" />
          <rect x="19" y="32" width="7" height="12" rx="2" fill="var(--c-mint)" />
          <rect x="29" y="25" width="7" height="19" rx="2" fill="var(--c-brand-soft)" />
          <rect x="39" y="17" width="7" height="27" rx="2" fill="var(--c-brand)" />
        </svg>
      );
    case 'easy':
      return (
        <svg {...common}>
          <circle cx="31" cy="31" r="29" fill="var(--c-cream-deep)" />
          <path d="m20 32 8 8 15-17" stroke="var(--c-brand)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}
