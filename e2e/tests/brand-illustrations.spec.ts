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
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(1100); // the slide is 900ms
}

test.describe('Brand illustrations', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  const stamped = ['/', '/about/', '/shop/', '/news/', '/contact/', '/privacy-policy/'];

  for (const path of stamped) {
  test(`every edge illustration on ${path} slides in and comes to rest on screen`, async ({ page }) => {
    await page.goto(path);
    const decos = page.locator('.c-edgeDeco');
    const count = await decos.count();
    expect(count).toBeGreaterThan(0);

    // Brought into view one at a time rather than scrolled past in steps:
    // WebKit under a loaded CI machine does not always run an intersection
    // check at every position a fast scroll passes through, and a missed
    // check reads exactly like the illustration never arriving.
    for (let i = 0; i < count; i++) {
      const deco = decos.nth(i);
      await deco.scrollIntoViewIfNeeded();
      await expect.poll(() => deco.evaluate((n) => n.classList.contains('is-in'))).toBe(true);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(1100); // the slide is 900ms

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
  }

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

/**
 * The opening animation.
 *
 * It is one CSS animation with no JavaScript in the loop, ending in
 * `visibility: hidden` — so the thing that can go wrong when its timeline is
 * lengthened is that some part of it outlives the overlay, or the overlay
 * outstays the timeline and sits over a page nobody can click.
 */
test.describe('Opening animation', () => {
  // A fresh context has an empty sessionStorage, so the opening plays.
  test('rolls the round mark in, brings the three drawings with it, and leaves', async ({ page }) => {
    await page.goto('/');

    const intro = page.locator('.c-intro');
    await expect(intro).toBeVisible();

    // The mark it is built around, and the company it keeps. They are CSS
    // backgrounds so that the pages which skip the opening never fetch them.
    await expect(page.locator('.c-intro__friend')).toHaveCount(3);
    expect(
      await page.locator('.c-intro__logo').evaluate((n) => getComputedStyle(n).backgroundImage),
    ).toContain('logo-top.png');

    // Nothing may spill sideways while the mark is still travelling.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    // And it has to take itself away, or the page underneath is unusable.
    await expect(intro).toBeHidden({ timeout: 6000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the hero mark is the same file, so it costs no second request', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeHidden({ timeout: 6000 });

    await expect(page.locator('.c-hero__logo')).toHaveAttribute('src', /logo-top\.png$/);
  });

  test('a page that skips the opening does not download it', async ({ page }) => {
    const fetched: string[] = [];
    page.on('response', (r) => {
      const name = r.url().split('/').pop() ?? '';
      if (name.endsWith('.png')) fetched.push(name);
    });

    await page.goto('/privacy-policy/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');

    // The overlay is in the markup of every page — it has to be, or returning
    // to '/' through the router would replay it — so what must not happen is
    // it being downloaded where it will never be drawn.
    await expect(page.locator('.c-intro')).toBeHidden();
    for (const name of ['logo-top.png', 'deco-left-bear-boy.png', 'deco-right-rabbit-girl.png']) {
      expect(fetched).not.toContain(name);
    }
  });

  test('coming back to the top page does not hide the hero mark', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeHidden({ timeout: 6000 });

    // The opening is over and will not replay, so the mark it waited for must
    // not keep waiting: the delay is keyed on the opening being on screen, and
    // it is not.
    // The hero's own link, not the menu's: the menu is behind a hamburger at
    // phone widths, and this has to be a client-side navigation either way.
    await page.getByRole('link', { name: /amei ayukoについて/ }).first().click();
    await page.waitForURL('**/about/');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Well inside the 2260ms the mark used to wait, and well outside the
    // ~340ms its own entrance takes: the window is what makes this a test of
    // the delay rather than of the animation.
    await expect
      .poll(
        () => page.locator('.c-hero__logo').evaluate((el) => Number(getComputedStyle(el).opacity)),
        { timeout: 1500 },
      )
      .toBeGreaterThan(0.9);
  });
});
