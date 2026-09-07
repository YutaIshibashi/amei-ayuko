import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

/**
 * `/news/{id}` stays indexable once the page has actually rendered.
 *
 * The article shell used to declare `robots: noindex` of its own. render.php
 * strips that tag from <head> before the response goes out, so every check
 * that read the server's HTML passed — and the pages were still refused, with
 * Google reporting "noindex detected in robots meta tag" for
 * https://amei-ayuko.jp/news/1.
 *
 * The reason only a browser can see it: Next.js serialises the route's
 * metadata into the RSC payload further down the document as well, and React
 * puts the tag back the moment it hydrates. Google renders before it decides.
 * So these assertions run against the DOM after hydration, not the response
 * body — the same thing the Rich Results Test looks at.
 */
test.describe('News article indexability', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  /** Resolves once the client has taken over and rendered the article. */
  async function hydrate(page: import('@playwright/test').Page, path: string) {
    await page.goto(path);
    // The heading only exists after the client has fetched and rendered.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/no-js/);
  }

  test('the rendered page carries no noindex anywhere', async ({ page }) => {
    await hydrate(page, '/news/100');

    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content')));

    expect(robots.length).toBeGreaterThan(0);
    for (const value of robots) {
      expect(value).toMatch(/(^|,\s*)index/);
      expect(value).toContain('follow');
      expect(value).not.toContain('noindex');
    }

    // Not just the meta: nothing in the rendered document may say it, because
    // anything React can replay into <head> is something a crawler can read.
    expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('noindex');
  });

  test('hydration does not put a noindex back', async ({ page }) => {
    await hydrate(page, '/news/100');

    // A client-side navigation re-runs the metadata the payload carries — the
    // same code path that resurrected the tag.
    const before = await page.locator('meta[name="robots"]').count();
    await page.goto('/news/');
    await page.locator('.c-newsItem__link').first().click();
    await expect(page).toHaveURL(/\/news\/\d+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('noindex');
    expect(await page.locator('meta[name="robots"]').count()).toBe(before);
  });

  test('the article still renders its own content and breadcrumb', async ({ page }) => {
    await hydrate(page, '/news/100');

    // The fix must not have cost the page anything a crawler wants.
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
    await expect(page.locator('.c-articleBody')).toBeVisible();
  });

  test('the shop page keeps its own indexability', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const robots = await page
      .locator('meta[name="robots"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content')));

    expect(robots.length).toBeGreaterThan(0);
    for (const value of robots) {
      expect(value).not.toContain('noindex');
    }
  });

  test('a product URL renders without a noindex either', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    await expect(page.getByRole('dialog')).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.innerHTML)).not.toContain('noindex');
  });

  test('pages that are meant to be excluded still are', async ({ page }) => {
    // The change removes one `noindex`; it must not have removed the others.
    await page.goto('/contact/thanks/');
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
      'content',
      /noindex/,
    );
  });
});
