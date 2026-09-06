import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

/**
 * The opening animation.
 *
 * The behavioural tests matter less than the two guarantees underneath them:
 * that the overlay can never strand a visitor on a covered page, and that it
 * never becomes the reason LCP is slow.
 */
test.describe('Opening animation', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('plays on the first visit and then removes itself', async ({ page }) => {
    await page.goto('/');
    const intro = page.locator('.c-intro');

    await expect(intro).toBeVisible();
    // Self-terminating: the final keyframe sets visibility: hidden, so this
    // resolves without any JavaScript having run.
    await expect(intro).toBeHidden({ timeout: 4000 });
  });

  test('stops hit-testing once it has finished', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeHidden({ timeout: 4000 });

    // If the overlay still intercepted pointer events, this click would fail.
    await page.getByRole('link', { name: 'オンラインショップを見る' }).click();
    await expect(page).toHaveURL(/\/shop\/$/);
  });

  test('is skipped on the second load within a session', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeVisible();

    // Same page context, so sessionStorage carries over.
    await page.goto('/about/');
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-intro', 'skip');
    await expect(page.locator('.c-intro')).toBeHidden();
  });

  test('never plays on a page other than the top page', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.locator('html')).toHaveAttribute('data-intro', 'skip');
    await expect(page.locator('.c-intro')).toBeHidden();
  });

  test('does not replay when navigating back to the top page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeHidden({ timeout: 4000 });

    // Client-side navigation: the intro lives in the persistent layout, so it
    // must not remount and replay.
    await page.getByRole('link', { name: 'オンラインショップを見る' }).click();
    await expect(page).toHaveURL(/\/shop\/$/);
    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.c-intro')).toBeHidden();
  });

  test('is dropped entirely under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.c-intro')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('is invisible to assistive technology', async ({ page }) => {
    await page.goto('/');
    const intro = page.locator('.c-intro');
    await expect(intro).toHaveAttribute('aria-hidden', 'true');
    // `inert` also keeps it out of the tab order while it is on screen.
    await expect(intro).toHaveAttribute('inert', '');
  });

  test('leaves the hero paintable underneath, so LCP is unaffected', async ({ page }) => {
    await page.goto('/');

    // The guarantee: the hero is rendered normally from the start. Chrome only
    // disqualifies an LCP candidate for `opacity: 0` — being covered is fine —
    // so the hero image must be fully opaque and laid out even while the
    // overlay is still on screen.
    const heroState = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('.c-hero__frame img');
      if (!img) return null;
      const style = getComputedStyle(img);
      const box = img.getBoundingClientRect();
      return {
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        area: Math.round(box.width * box.height),
      };
    });

    expect(heroState).not.toBeNull();
    expect(heroState!.opacity).toBe('1');
    expect(heroState!.display).not.toBe('none');
    expect(heroState!.visibility).toBe('visible');
    expect(heroState!.area).toBeGreaterThan(10_000);
  });

  test('the h1 is never animated, for the same reason', async ({ page }) => {
    await page.goto('/');
    const opacity = await page.evaluate(
      () => getComputedStyle(document.querySelector('#hero-title')!).opacity,
    );
    expect(opacity).toBe('1');
  });
});
