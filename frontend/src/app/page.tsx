import type { Metadata } from 'next';
import JsonLd from '@/components/JsonLd';
import AboutTeaser from '@/components/home/AboutTeaser';
import CategoryCards from '@/components/home/CategoryCards';
import Concept from '@/components/home/Concept';
import DesignSection from '@/components/home/DesignSection';
import Hero from '@/components/home/Hero';
import InstagramCta from '@/components/home/InstagramCta';
import NewsTeaser from '@/components/home/NewsTeaser';
import { INSTAGRAM_URL, SHOPS, SITE } from '@/lib/site';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

/**
 * Top page. Section order is fixed:
 * Hero → Concept → Categories → News → Design → Instagram → About → Footer.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE.name,
            url: `${SITE.url}/`,
            inLanguage: 'ja',
            description: SITE.description,
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: SITE.name,
            url: `${SITE.url}/`,
            logo: `${SITE.url}/brand/logo.svg`,
            description: SITE.description,
            sameAs: [INSTAGRAM_URL, ...SHOPS.map((s) => s.url)],
          },
        ]}
      />

      <Hero />
      <Concept />
      <CategoryCards />
      <NewsTeaser />
      <DesignSection />
      <InstagramCta />
      <AboutTeaser />
    </>
  );
}
