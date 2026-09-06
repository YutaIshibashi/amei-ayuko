'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ASSETS, NAV, SITE } from '@/lib/site';
import { useFocusTrap, useScrolledPast, useScrollLock } from '@/lib/hooks';
import { Flower, Heart, Sparkle } from './Deco';
import { IconArrowRight, IconShop } from './Icons';

/**
 * Site header.
 *
 * Desktop: logo left, navigation right. Transparent over the hero on the top
 * page, gaining a translucent surface once the user scrolls.
 * Mobile: logo + hamburger opening a full-screen branded menu.
 */
export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  // Only the top page has a hero for the bar to sit on top of, so the sub-page
  // header is opaque from the start and never needs the scroll state.
  const stuck = useScrolledPast(40) && isHome;

  useScrollLock(menuOpen);
  const close = useCallback(() => setMenuOpen(false), []);
  useFocusTrap(menuRef, menuOpen, close);

  // Returning focus to the toggle is what makes the menu usable by keyboard.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !menuOpen) burgerRef.current?.focus({ preventScroll: true });
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  const headerClass = [
    'c-header',
    isHome ? '' : 'c-header--solid',
    stuck ? 'is-stuck' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <header className={headerClass}>
        <div className="c-header__inner">
          <Link href="/" className="c-header__logo" aria-label={`${SITE.name} ホームへ`}>
            {/* Explicit dimensions: the logo must never cause a layout shift. */}
            <img src={ASSETS.logo} alt={SITE.name} width={168} height={42} />
          </Link>

          <nav className="c-header__nav" aria-label="メインメニュー">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="c-header__link"
                aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
              >
                {item.en}
              </Link>
            ))}
            <Link href="/shop/" className="a-btn c-header__cta">
              <IconShop width={18} height={18} />
              オンラインショップ
            </Link>
          </nav>

          <button
            ref={burgerRef}
            type="button"
            className="c-burger"
            aria-expanded={menuOpen}
            aria-controls="global-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="a-visuallyHidden">{menuOpen ? 'メニューを閉じる' : 'メニューを開く'}</span>
            <span className="c-burger__box" aria-hidden="true">
              <span className="c-burger__bar" />
              <span className="c-burger__bar" />
              <span className="c-burger__bar" />
            </span>
          </button>
        </div>
      </header>

      {/* Full-screen mobile menu — kept in the DOM so it can animate both ways,
          but hidden from assistive tech and tab order while closed. */}
      <div
        id="global-menu"
        ref={menuRef}
        className={`c-menu ${menuOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="メニュー"
        // `inert` removes the closed menu from tab order and the a11y tree
        // without unmounting it, so the open/close transition still runs.
        inert={!menuOpen}
      >
        <Flower className="c-deco c-deco--float" style={{ top: '14%', right: '8%', color: 'var(--c-brand-soft)' }} width={70} />
        <Heart className="c-deco" style={{ bottom: '18%', left: '6%', color: 'var(--c-berry)', opacity: 0.4 }} width={44} />
        <Sparkle className="c-deco c-deco--float" style={{ top: '30%', left: '12%', color: 'var(--c-sun)' }} width={26} />

        <div className="c-menu__inner">
          <ul className="c-menu__list">
            {NAV.map((item) => (
              <li key={item.href} className="c-menu__item">
                <Link
                  href={item.href}
                  className="c-menu__link"
                  aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                  onClick={close}
                >
                  <span className="c-menu__en">{item.en}</span>
                  <span className="c-menu__jp">{item.ja}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Online Shop is the priority destination, so it gets its own card. */}
          <Link href="/shop/" className="c-menu__shop" onClick={close}>
            <span className="c-menu__shopText">
              <span className="c-menu__shopTitle">Online Shop</span>
              <span className="c-menu__shopNote">アルバムフレーク・スタンプはこちら</span>
            </span>
            <Flower className="c-menu__shopIllust" style={{ color: 'var(--c-brand-soft)' }} width={76} />
            <IconArrowRight aria-hidden="true" />
          </Link>

          <div className="c-menu__foot">
            <Link href="/news/" onClick={close}>News</Link>
            <Link href="/privacy-policy/" onClick={close}>Privacy Policy</Link>
          </div>
        </div>
      </div>
    </>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname.startsWith(href.replace(/\/$/, ''));
}
