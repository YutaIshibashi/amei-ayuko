import { ASSETS, SITE } from '@/lib/site';

/**
 * Opening animation.
 *
 * Three constraints shaped this, and they are worth stating because they rule
 * out the obvious implementations:
 *
 * 1. **It must not touch LCP.** Chrome does not exclude an element from LCP
 *    just because something covers it — only `opacity: 0` disqualifies it. So
 *    the hero renders completely normally underneath and paints on schedule;
 *    this is a pure overlay that never animates, delays or hides the content
 *    below it. Fading the hero *in* after the intro would have moved LCP to
 *    the end of the animation, which is exactly what we must not do.
 *
 * 2. **It must dismiss itself without JavaScript.** The whole sequence is one
 *    CSS animation ending in `visibility: hidden` with `forwards`, so a failed
 *    or slow bundle can never leave a visitor staring at a covered page. JS is
 *    involved only in *deciding whether to show it at all* (see layout.tsx),
 *    never in removing it.
 *
 * 3. **It must be invisible to assistive tech.** `aria-hidden` plus `inert`
 *    keeps it out of the accessibility tree and the tab order entirely, so a
 *    screen-reader user starts reading the page immediately rather than
 *    waiting out a decorative animation.
 *
 * Rendered from the root layout rather than the home page so that it lives in
 * the persistent layout subtree: client-side navigation away and back to `/`
 * does not remount it, and therefore does not replay it. CSS then limits it to
 * the home page via the `data-intro` attribute the head script sets.
 */
export default function Intro() {
  return (
    <div className="c-intro" aria-hidden="true" inert>
      {/* Spread across the viewport rather than around the wordmark, so the
          composition does not clump in the middle of a wide screen. */}
      <span className="c-intro__dot c-intro__dot--1" />
      <span className="c-intro__dot c-intro__dot--2" />
      <span className="c-intro__dot c-intro__dot--3" />
      <span className="c-intro__dot c-intro__dot--4" />

      <div className="c-intro__inner">
        {/* Same file as the hero logo, so this costs no extra request. */}
        <img
          className="c-intro__logo"
          src={ASSETS.logo}
          alt=""
          width={280}
          height={70}
          fetchPriority="high"
        />

        {/*
          The hand-drawn underline, drawn on rather than faded in.
          `pathLength="1"` normalises the path so the animation is a plain
          1 → 0 dashoffset with nothing measured at runtime.
        */}
        <svg
          className="c-intro__rule"
          /* viewBox matches the artwork's own bounds, so neither stroke can
             overhang the other. */
          viewBox="0 0 192 22"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className="c-intro__stroke c-intro__stroke--1"
            pathLength="1"
            d="M6 9c10-9 20-9 30 0s20 9 30 0 20-9 30 0 20 9 30 0 20-9 30 0 20 9 30 0"
            stroke="var(--c-brand-soft)"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            className="c-intro__stroke c-intro__stroke--2"
            pathLength="1"
            d="M52 18h88"
            stroke="var(--c-mint)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>

        <p className="c-intro__copy">{SITE.concept}</p>
      </div>
    </div>
  );
}
