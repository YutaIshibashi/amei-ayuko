import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

/**
 * Accessibility guarantees that are cheap to regress and expensive to notice:
 * the skip link, alt text, keyboard reachability and focus visibility.
 */
test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('a skip link is the first thing the keyboard reaches', async ({ page, browserName }) => {
    // Safari only tabs to links when "Press Tab to highlight each item" is on,
    // and WebKit follows that default. The link's behaviour is verified below
    // instead, which is the part this project actually controls.
    test.skip(browserName === 'webkit', 'WebKit does not Tab to links by default.');

    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: '本文へスキップ' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });

  test('the skip link reveals itself on focus and jumps to the main content', async ({ page }) => {
    await page.goto('/');
    const skip = page.getByRole('link', { name: '本文へスキップ' });

    // Off-screen until focused, so it never intrudes on a mouse user.
    await expect(skip).toHaveCSS('transform', /matrix/);
    await skip.focus();
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute('href', '#main');
    await expect(page.locator('#main')).toBeVisible();
  });

  test('every content image carries alt text', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.locator('.c-pcard').first()).toBeVisible();

    const missing = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter((img) => !img.hasAttribute('alt') && img.getAttribute('aria-hidden') !== 'true')
        .map((img) => img.getAttribute('src') ?? '(no src)'),
    );
    expect(missing).toEqual([]);
  });

  test('the product modal is announced as a modal dialog and labelled', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog).toHaveAttribute('aria-labelledby', 'product-modal-title');
  });

  test('a product card can be opened from the keyboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Keyboard navigation is a desktop concern here.');

    await page.goto('/shop/');
    await page.locator('.c-pcard__btn').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('shop tabs expose the tab/tabpanel relationship', async ({ page }) => {
    await page.goto('/shop/');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(page.getByRole('tabpanel')).toBeVisible();
  });

  test('every form control has an associated label', async ({ page }) => {
    await page.goto('/contact/');
    const unlabelled = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('input, select, textarea'))
        .filter((el) => {
          if (el.getAttribute('type') === 'hidden') return false;
          if (el.closest('[aria-hidden="true"]')) return false; // honeypot
          const id = el.getAttribute('id');
          const labelled = id ? document.querySelector(`label[for="${id}"]`) : null;
          return !labelled && !el.getAttribute('aria-label') && !el.closest('label');
        })
        .map((el) => el.getAttribute('name') ?? el.tagName),
    );
    expect(unlabelled).toEqual([]);
  });

  test('reduced motion is honoured', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    // Reveal animations resolve immediately rather than waiting on scroll.
    const duration = await page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--dur-slow').trim(),
    );
    expect(duration).toBe('1ms');
  });
});
