/**
 * Inline icon set.
 *
 * Icons are inlined rather than loaded from a sprite or icon font: there are
 * few of them, they inherit `currentColor`, and it keeps requests off the
 * critical path. All are decorative unless a `title` is supplied.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}><path d="M20 12H5" /><path d="m11 18-6-6 6-6" /></Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}><path d="m6 6 12 12" /><path d="M18 6 6 18" /></Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);
export const IconShare = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v13" /><path d="m8 7 4-4 4 4" /><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" /></Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3A4 4 0 0 0 13 5.34l-1.5 1.5" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3A4 4 0 0 0 11 18.66l1.5-1.5" /></Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m5 13 4 4L19 7" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></Svg>
);
export const IconInstagram = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M17.2 6.8h.01" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p} strokeWidth="1.6">
    <path d="M4 4l7.6 9.9L4.4 20" />
    <path d="M20 20l-7.6-9.9L19.6 4" />
  </Svg>
);
export const IconLine = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 10.4c0-3.6-3.6-6.4-8-6.4S4 6.8 4 10.4c0 3.2 2.9 5.9 6.8 6.4.3 0 .6.2.7.5.1.2 0 .6 0 .8l-.1.7c0 .2-.2.8.7.4 1-.4 5.3-3.1 7.2-5.3 1.1-1.2 1.7-2.5 1.7-3.5Z" />
  </Svg>
);
export const IconShop = (p: IconProps) => (
  <Svg {...p}><path d="M4 8h16l-1 11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1L4 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></Svg>
);
export const IconMail = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 8 7.4 5a1 1 0 0 0 1.2 0L20 8" /></Svg>
);
export const IconZoom = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /><path d="M11 8.5v5" /><path d="M8.5 11h5" /></Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
