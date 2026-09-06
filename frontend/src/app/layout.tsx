import type { Metadata, Viewport } from 'next';
import SiteChrome from '@/components/SiteChrome';
import { SITE } from '@/lib/site';
import '@/styles/globals.css';

/**
 * Webfonts.
 *
 * Loaded with a plain stylesheet link rather than `next/font`, because
 * next/font does not expose the `japanese` subset for Zen Maru Gothic — the
 * self-hosted build would silently drop every Japanese glyph. Google's CSS2
 * endpoint returns unicode-range–split faces, so a visitor downloads only the
 * few chunks their text actually needs.
 *
 * Both faces are used for headings only (body copy stays on system fonts),
 * and `display=swap` guarantees text paints immediately.
 */
const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2' +
  '?family=Zen+Maru+Gothic:wght@500;700' +
  '&family=Caveat:wght@400..600' +
  '&display=swap';

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} | ${SITE.concept}${SITE.conceptSub}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name }],
  creator: SITE.name,
  keywords: [
    'アルバムフレーク',
    'アルバムクラフト',
    '育児アルバム',
    'ラバースタンプ',
    '手描きスタンプ',
    '成長記録',
    'イラストレーター',
    'amei ayuko',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    url: SITE.url,
    title: `${SITE.name} | ${SITE.concept}${SITE.conceptSub}`,
    description: SITE.description,
    images: [{ url: '/brand/ogp-default.png', width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE.name} | ${SITE.concept}`,
    description: SITE.description,
    images: ['/brand/ogp-default.png'],
  },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#fffdfa',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="no-js">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
        {/*
          Marks the document as JS-capable before first paint. CSS uses `.no-js`
          to keep scroll-reveal content visible when scripts fail to run.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.remove('no-js');`,
          }}
        />
      </head>
      <body>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
