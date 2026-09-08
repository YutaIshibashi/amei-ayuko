import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures.js';
// The head the server injects for dynamic URLs, standing in for render.php's.
// @ts-expect-error -- plain JS module, shared with the test server on purpose.
import { INJECTED } from '../injected-head.mjs';

/**
 * The head of a dynamic URL survives the page rendering.
 *
 * `/news/{id}` and `/shop/?…&product={id}` are served by render.php, which
 * replaces the head of an exported shell with that article's or product's own
 * title, description, canonical, OGP, Twitter card and JSON-LD. Everything
 * that reads the response sees the right thing.
 *
 * A browser did not. Next.js serialises a route's resolved metadata into the
 * RSC payload as well as into <head>, and React re-applies it on hydration —
 * so the shell's own metadata came back after the page rendered: `noindex` on
 * every published article, and the shop's title and canonical over every
 * product's. Google renders before it decides, and reported
 * "noindex detected in robots meta tag" for https://amei-ayuko.jp/news/1.
 *
 * So these assertions run against the DOM after hydration, not the response
 * body — the same thing the Rich Results Test looks at.
 */

type Meta = {
  titles: string[];
  canonical: string[];
  robots: string[];
  description: string[];
  ogTitle: string[];
  ogDescription: string[];
  ogUrl: string[];
  ogImage: string[];
  ogType: string[];
  twitterTitle: string[];
  twitterDescription: string[];
  twitterImage: string[];
  jsonLdTypes: string[];
  html: string;
};

/** Every head value a crawler reads, once the client has taken over. */
async function head(page: Page): Promise<Meta> {
  return page.evaluate(() => {
    const contents = (selector: string) =>
      [...document.querySelectorAll(selector)].map((n) => n.getAttribute('content') ?? '');

    return {
      titles: [...document.querySelectorAll('title')].map((t) => t.textContent ?? ''),
      canonical: [...document.querySelectorAll('link[rel="canonical"]')].map(
        (l) => l.getAttribute('href') ?? '',
      ),
      robots: contents('meta[name="robots"]'),
      description: contents('meta[name="description"]'),
      ogTitle: contents('meta[property="og:title"]'),
      ogDescription: contents('meta[property="og:description"]'),
      ogUrl: contents('meta[property="og:url"]'),
      ogImage: contents('meta[property="og:image"]'),
      ogType: contents('meta[property="og:type"]'),
      twitterTitle: contents('meta[name="twitter:title"]'),
      twitterDescription: contents('meta[name="twitter:description"]'),
      twitterImage: contents('meta[name="twitter:image"]'),
      jsonLdTypes: [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(
        (s) => {
          try {
            const parsed: unknown = JSON.parse(s.textContent ?? '');
            const graphs = Array.isArray(parsed) ? parsed : [parsed];
            return graphs.map((g) => String((g as Record<string, unknown>)['@type']));
          } catch {
            return ['unparsable'];
          }
        },
      ),
      html: document.documentElement.innerHTML,
    };
  });
}

/** Asserts the injected head is the only one, field by field. */
function expectOnly(meta: Meta, injected: typeof INJECTED.news) {
  expect(meta.titles).toEqual([injected.title]);
  expect(meta.canonical).toEqual([injected.canonical]);
  expect(meta.description).toEqual([injected.description]);
  expect(meta.ogTitle).toEqual([injected.title]);
  expect(meta.ogDescription).toEqual([injected.description]);
  expect(meta.ogUrl).toEqual([injected.canonical]);
  expect(meta.ogImage).toEqual([injected.image]);
  expect(meta.ogType).toEqual([injected.ogType]);
  expect(meta.twitterTitle).toEqual([injected.title]);
  expect(meta.twitterDescription).toEqual([injected.description]);
  expect(meta.twitterImage).toEqual([injected.image]);

  expect(meta.robots).toEqual(['index, follow, max-image-preview:large']);
  expect(meta.html).not.toContain('noindex');
}

test.describe('Dynamic SEO after hydration', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  /** Resolves once the client has taken over and rendered. */
  async function hydrated(page: Page, path: string) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/no-js/);
  }

  /* ------------------------------------------------------------------ news */

  test('an article keeps the head render.php gave it', async ({ page }) => {
    await hydrated(page, '/news/100');
    expectOnly(await head(page), INJECTED.news);
  });

  test("an article's structured data is the article's", async ({ page }) => {
    await hydrated(page, '/news/100');
    const meta = await head(page);

    expect(meta.jsonLdTypes).toEqual(['NewsArticle', 'BreadcrumbList']);
  });

  test('an article renders its own content and breadcrumb', async ({ page }) => {
    await hydrated(page, '/news/100');

    // The head is not worth much if the fix cost the page its body.
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
    await expect(page.locator('.c-articleBody')).toBeVisible();
  });

  /* --------------------------------------------------------------- product */

  test('a product keeps the head render.php gave it', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    await expect(page.getByRole('dialog')).toBeVisible();

    expectOnly(await head(page), INJECTED.product);
  });

  test("a product's structured data is the product's", async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    await expect(page.getByRole('dialog')).toBeVisible();
    const meta = await head(page);

    expect(meta.jsonLdTypes).toEqual(['Product', 'BreadcrumbList']);
    // The shop's own graph describes the listing, not this product.
    expect(meta.jsonLdTypes).not.toContain('CollectionPage');
  });

  /* ------------------------------------------------- navigating around it */

  test('arriving from the list leaves one of each tag', async ({ page }) => {
    await page.goto('/news/');
    await page.locator('.c-newsItem__link').first().click();
    await expect(page).toHaveURL(/\/news\/\d+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const meta = await head(page);
    expect(meta.titles).toHaveLength(1);
    expect(meta.canonical).toHaveLength(1);
    expect(meta.robots).toHaveLength(1);
    expect(meta.description).toHaveLength(1);
    expect(meta.html).not.toContain('noindex');
  });

  test('going back does not stack tags up', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.locator('.c-pcard').first()).toBeVisible();

    await page.locator('.c-pcard__btn').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toBeHidden();

    const meta = await head(page);
    expect(meta.titles).toHaveLength(1);
    expect(meta.canonical).toHaveLength(1);
    expect(meta.robots).toHaveLength(1);
    expect(meta.description).toHaveLength(1);
  });

  /* --------------------------------- leaving a product URL you arrived on */

  test('closing a product you arrived on directly hands the head back', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    await expect(page.getByRole('dialog')).toBeVisible();

    // What we are leaving: the product shell, with the product's head.
    expectOnly(await head(page), INJECTED.product);

    // Survives a SPA close, not a real navigation — which is the difference
    // this test exists to catch.
    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    await page.getByRole('button', { name: '商品の詳細を閉じる' }).click();
    await expect(page).toHaveURL('/shop/?category=album-flake');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The listing was fetched for real: this document is `/shop/`'s own, not
    // the product shell with its URL rewritten.
    expect(
      await page.evaluate(
        () => (window as unknown as { __sameDocument?: boolean }).__sameDocument ?? false,
      ),
    ).toBe(false);

    const meta = await head(page);
    expect(meta.canonical).toEqual(['https://amei-ayuko.jp/shop/']);
    expect(meta.titles).toEqual(['オンラインショップ｜アルバムフレーク・ラバースタンプ | amei ayuko']);
    expect(meta.description).toEqual([
      '手描きのアルバムフレークとラバースタンプの一覧です。育児アルバムや成長記録づくりにぴったりの紙モノを、minneにて販売しています。',
    ]);
    expect(meta.ogUrl).toEqual(['https://amei-ayuko.jp/shop/']);

    // The product's graphs go with it; the listing's comes back.
    expect(meta.jsonLdTypes).toEqual(['CollectionPage']);

    expect(meta.robots).toEqual(['index, follow, max-image-preview:large']);
    expect(meta.html).not.toContain('noindex');

    // One of everything — no tag left over from the document we came from.
    for (const values of [
      meta.titles, meta.canonical, meta.robots, meta.description,
      meta.ogTitle, meta.ogDescription, meta.ogUrl, meta.ogImage, meta.ogType,
      meta.twitterTitle, meta.twitterDescription, meta.twitterImage,
    ]) {
      expect(values).toHaveLength(1);
    }
  });

  test('closing a product opened from the list stays a SPA navigation', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.locator('.c-pcard').first()).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
    });

    await page.locator('.c-pcard__btn').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: '商品の詳細を閉じる' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Back through history, as before: no reload, and none is wanted — this
    // document was always `/shop/`'s own.
    expect(
      await page.evaluate(
        () => (window as unknown as { __sameDocument?: boolean }).__sameDocument ?? false,
      ),
    ).toBe(true);
    await expect(page).toHaveURL(/\/shop\/$/);
  });

  /* ----------------------------------------------------- the static pages */

  const staticPages = [
    { path: '/', canonical: 'https://amei-ayuko.jp/' },
    { path: '/shop/', canonical: 'https://amei-ayuko.jp/shop/' },
    { path: '/news/', canonical: 'https://amei-ayuko.jp/news/' },
    { path: '/about/', canonical: 'https://amei-ayuko.jp/about/' },
    { path: '/contact/', canonical: 'https://amei-ayuko.jp/contact/' },
    { path: '/privacy-policy/', canonical: 'https://amei-ayuko.jp/privacy-policy/' },
  ];

  for (const { path, canonical } of staticPages) {
    test(`${path} still owns its own head`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const meta = await head(page);

      expect(meta.canonical).toEqual([canonical]);
      expect(meta.titles).toHaveLength(1);
      expect(meta.titles[0]).not.toBe('');
      expect(meta.description).toHaveLength(1);
      // Not every page asks for the large image preview, but every one of
      // them is indexable and says so exactly once.
      expect(meta.robots).toHaveLength(1);
      expect(meta.robots[0]).toMatch(/^index, follow/);
      expect(meta.html).not.toContain('noindex');
    });
  }

  test('/shop/ keeps the graph that describes the listing', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect((await head(page)).jsonLdTypes).toContain('CollectionPage');
  });

  test('pages meant to be excluded still are', async ({ page }) => {
    // The change removes metadata from two shells; it must not have reached
    // the pages that are deliberately kept out of the index.
    await page.goto('/contact/thanks/');
    const meta = await head(page);

    expect(meta.robots).toHaveLength(1);
    expect(meta.robots[0]).toContain('noindex');
    expect(meta.canonical).toEqual(['https://amei-ayuko.jp/contact/thanks/']);
  });

  /* ------------------------------------------------- the shells themselves */

  const shells = [
    { shell: '/news/detail/', destination: '/news/' },
    { shell: '/shop/product/', destination: '/shop/' },
  ];

  for (const { shell, destination } of shells) {
    test(`${shell} is not a page of its own`, async ({ page }) => {
      const response = await page.goto(shell);

      // Apache 301s it; the browser follows, so what matters is where it lands.
      expect(new URL(page.url()).pathname).toBe(destination);
      expect(response?.status()).toBe(200);
    });
  }
});
