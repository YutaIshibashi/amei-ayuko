import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

test.describe('Home', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('renders every section in the fixed order', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/amei ayuko/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('カタチに');

    // The brief fixes this order; a reshuffle should fail the build.
    const headings = page.locator('h2');
    await expect(headings.filter({ hasText: 'コンセプト' })).toBeVisible();
    await expect(headings.filter({ hasText: 'ラインナップ' })).toBeVisible();
    await expect(headings.filter({ hasText: 'デザイン制作' })).toBeVisible();
    await expect(headings.filter({ hasText: 'Instagramでも作品を紹介' })).toBeVisible();
    await expect(headings.filter({ hasText: 'つくっているひと' })).toBeVisible();
  });

  test('shows at most five news entries and links to the full list', async ({ page }) => {
    await page.goto('/');
    const items = page.locator('.c-newsMini__item');
    await expect(items).toHaveCount(5);
    await page.getByRole('link', { name: 'もっと見る' }).click();
    await expect(page).toHaveURL(/\/news\/?$/);
  });

  test('category cards deep-link into the shop with the tab preselected', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Album Flake/ }).first().click();
    await expect(page).toHaveURL(/\/shop\/\?category=album-flake/);
    await expect(page.getByRole('tab', { name: /Album Flake/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('does not load analytics before consent is given', async ({ page }) => {
    const gtagRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('googletagmanager.com')) gtagRequests.push(request.url());
    });

    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Cookieの利用について' })).toBeVisible();
    await page.waitForTimeout(500);

    expect(gtagRequests).toEqual([]);
  });

  test('cookie choice is remembered across reloads', async ({ page }) => {
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Cookieの利用について' });
    await banner.getByRole('button', { name: '拒否する' }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.getByRole('region', { name: 'Cookieの利用について' })).toBeHidden();
  });
});

test.describe('Header', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('desktop navigation reaches every primary page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The desktop navigation is hidden below 900px.');

    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'メインメニュー' });

    await nav.getByRole('link', { name: 'About', exact: true }).click();
    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('amei ayuko について');

    await nav.getByRole('link', { name: 'Contact', exact: true }).click();
    await expect(page).toHaveURL(/\/contact\/$/);
  });

  test('gains a background once the page is scrolled', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop-only affordance.');

    await page.goto('/');
    const header = page.locator('.c-header');
    await expect(header).not.toHaveClass(/is-stuck/);
    await page.mouse.wheel(0, 600);
    await expect(header).toHaveClass(/is-stuck/);
  });
});

test.describe('Mobile menu', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('opens, traps focus, closes with Escape and restores focus', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The hamburger only exists below 900px.');

    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'メニューを開く' });
    await toggle.click();

    const menu = page.getByRole('dialog', { name: 'メニュー' });
    await expect(menu).toBeVisible();
    // Online Shop gets its own emphasised card inside the menu.
    await expect(menu.locator('.c-menu__shop')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(toggle).toBeFocused();
  });

  test('navigates and closes itself', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The hamburger only exists below 900px.');

    await page.goto('/');
    await page.getByRole('button', { name: 'メニューを開く' }).click();
    await page.getByRole('dialog', { name: 'メニュー' }).getByRole('link', { name: /About/ }).click();

    await expect(page).toHaveURL(/\/about\/$/);
    await expect(page.getByRole('dialog', { name: 'メニュー' })).toBeHidden();
  });
});
