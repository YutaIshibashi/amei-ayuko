'use client';

import Link from 'next/link';
import { ASSETS, INSTAGRAM_URL, NAV, SITE } from '@/lib/site';
import { useSettings } from '@/lib/hooks';
import { track } from '@/lib/analytics';
import { Flower, Sparkle, WaveDivider } from './Deco';
import { IconExternal, IconInstagram } from './Icons';

/**
 * Footer.
 *
 * Treated as a closing piece of brand storytelling rather than a link dump:
 * a wave divider, the mark, the concept line, then the practical links.
 * External shop links are chips so minne can be given clear priority.
 */
export default function Footer({ onOpenCookieSettings }: { onOpenCookieSettings: () => void }) {
  const s = useSettings();

  const shops = [
    { label: 'minne',    url: s.minneUrl,   primary: true  },
    { label: 'Creema',   url: s.creemaUrl,  primary: false },
    { label: 'メルカリ',  url: s.mercariUrl, primary: false },
    { label: 'INFRAME',  url: s.inframeUrl, primary: false },
    { label: 'BASE',     url: s.baseUrl,    primary: false },
    { label: 'ラクマ',    url: s.rakumaUrl,  primary: false },
  ].filter((shop) => Boolean(shop.url));

  return (
    <footer className="c-footer">
      <WaveDivider color="var(--c-cream-deep)" />

      <Flower className="c-deco c-deco--float" style={{ top: '12%', right: '6%', color: 'var(--c-brand-soft)', opacity: 0.5 }} width={90} />
      <Sparkle className="c-deco" style={{ bottom: '22%', left: '4%', color: 'var(--c-sun)', opacity: 0.55 }} width={30} />

      <div className="l-page c-footer__inner">
        <div className="c-footer__top">
          <div>
            <img
              className="c-footer__brandLogo"
              src={ASSETS.logo}
              alt={SITE.name}
              width={186}
              height={46}
              loading="lazy"
            />
            <p className="c-footer__concept">{s.brandConcept}</p>
            <p className="c-footer__copyLine">{s.footerCopy}</p>
          </div>

          <nav aria-label="フッターメニュー">
            <p className="c-footer__colTitle">Menu</p>
            <ul className="c-footer__list">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.ja}</Link>
                </li>
              ))}
              <li><Link href="/news/">お知らせ</Link></li>
              <li><Link href="/privacy-policy/">プライバシーポリシー</Link></li>
              <li>
                {/* Consent must remain changeable at any time, from any page. */}
                <button type="button" onClick={onOpenCookieSettings}>
                  Cookie設定
                </button>
              </li>
            </ul>
          </nav>

          <div>
            <p className="c-footer__colTitle">Shop &amp; Social</p>
            <ul className="c-footer__list" style={{ marginBottom: 'var(--s-4)' }}>
              <li>
                <a
                  href={s.instagramUrl || INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track('click_instagram', { source: 'footer', destination: 'instagram' })}
                >
                  <IconInstagram width={18} height={18} />
                  Instagram
                  <IconExternal width={14} height={14} aria-hidden="true" />
                </a>
              </li>
            </ul>

            <div className="c-footer__shops">
              {shops.map((shop) => (
                <a
                  key={shop.label}
                  className={`c-footer__shopChip ${shop.primary ? 'c-footer__shopChip--primary' : ''}`}
                  href={shop.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    shop.primary
                      ? track('click_minne', { source: 'footer', destination: 'minne' })
                      : undefined
                  }
                >
                  {shop.label}
                  <IconExternal width={13} height={13} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="c-footer__bottom">
          <small>{s.copyright}</small>
          <small>{SITE.nameJa}</small>
        </div>
      </div>
    </footer>
  );
}
