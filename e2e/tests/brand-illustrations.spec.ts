import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './fixtures.js';

/**
 * The character illustrations reach the screen.
 *
 * They start translated clear of the edge they slide in from, which is easy to
 * build in a way that never finishes: observing the illustration itself cannot
 * work, because an element parked outside the viewport never intersects it, so
 * the slide that was meant to bring it in ends up waiting on its own result.
 * That failure is invisible in the markup — the elements are all there, at
 * opacity 0, just off screen — so it is asserted here instead.
 */

/** Scrolls the whole page so every observer fires, then returns to the top. */
async function scrollThrough(page: Page) {
  const height = page.viewportSize()?.height ?? 800;
  const total = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < total; y += Math.round(height * 0.6)) {
    await page.evaluate((v) => window.scrollTo({ top: v, behavior: 'instant' }), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(1100); // the slide is 900ms
}

test.describe('Brand illustrations', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('every edge illustration slides in and comes to rest on screen', async ({ page }) => {
    await page.goto('/');
    const decos = page.locator('.c-edgeDeco');
    expect(await decos.count()).toBeGreaterThan(0);

    await scrollThrough(page);

    const resting = await decos.evaluateAll((nodes) =>
      nodes.map((node) => {
        const img = node.querySelector('img');
        const box = img?.getBoundingClientRect();
        return {
          arrived: node.classList.contains('is-in'),
          opacity: Number(getComputedStyle(img!).opacity),
          loaded: Boolean(img?.complete && img.naturalWidth > 0),
          // Where it ended up, relative to the page rather than the scroll.
          left: (box?.left ?? 0) + window.scrollX,
          right: (box?.right ?? 0) + window.scrollX,
          width: box?.width ?? 0,
        };
      }),
    );

    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);

    for (const deco of resting) {
      expect(deco.arrived).toBe(true);
      expect(deco.loaded).toBe(true);
      expect(deco.opacity).toBeGreaterThan(0.5);
      expect(deco.width).toBeGreaterThan(0);
      // Flush with an edge is the point; entirely past one is the bug.
      expect(deco.right).toBeGreaterThan(0);
      expect(deco.left).toBeLessThan(pageWidth);
    }
  });

  test('they do not push the page sideways', async ({ page }) => {
    await page.goto('/');
    await scrollThrough(page);

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test('they stay behind the content and out of the way', async ({ page }) => {
    await page.goto('/');
    await scrollThrough(page);

    const styles = await page.locator('.c-edgeDeco').evaluateAll((nodes) =>
      nodes.map((n) => ({
        pointerEvents: getComputedStyle(n).pointerEvents,
        hidden: n.getAttribute('aria-hidden'),
        alt: n.querySelector('img')?.getAttribute('alt'),
      })),
    );

    for (const style of styles) {
      expect(style.pointerEvents).toBe('none');
      // Decorative: named for no one, and out of the accessibility tree.
      expect(style.alt).toBe('');
      expect(style.hidden).toBe('true');
    }
  });

  test('the header mark and the profile image render undistorted', async ({ page }) => {
    await page.goto('/');

    for (const locator of [
      page.locator('.c-header__logo img'),
      page.locator('.c-aboutTeaser__avatar img'),
    ]) {
      // The profile sits near the foot of the page and loads lazily, so it has
      // to be brought into view before there is anything to measure.
      await locator.scrollIntoViewIfNeeded();
      await expect(locator).toBeVisible();
      await expect
        .poll(() => locator.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
        .toBe(true);

      const image = await locator.evaluate((el: HTMLImageElement) => ({
        loaded: el.complete && el.naturalWidth > 0,
        naturalRatio: el.naturalWidth / el.naturalHeight,
        attrRatio: Number(el.getAttribute('width')) / Number(el.getAttribute('height')),
      }));

      expect(image.loaded).toBe(true);
      // A width/height pair that disagrees with the file is how an image ends
      // up stretched once CSS sizes only one axis.
      expect(image.attrRatio).toBeCloseTo(image.naturalRatio, 1);
    }
  });
});
