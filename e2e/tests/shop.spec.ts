import { expect, test } from '@playwright/test';
import { mockApi, PRODUCT_COUNTS, REPRESENTATIVE_PRODUCTS } from './fixtures.js';

test.describe('Online Shop', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('opens on Album Flake when reached without a category', async ({ page }) => {
    await page.goto('/shop/');
    await expect(page.getByRole('tab', { name: /Album Flake/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.c-pcard')).toHaveCount(PRODUCT_COUNTS['album-flake']);
  });

  test('honours the category in the URL', async ({ page }) => {
    await page.goto('/shop/?category=stamp');
    await expect(page.getByRole('tab', { name: /Stamp/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('ラバースタンプ おなまえ')).toBeVisible();
  });

  test('falls back to Album Flake for an unknown category', async ({ page }) => {
    await page.goto('/shop/?category=nonsense');
    await expect(page.getByRole('tab', { name: /Album Flake/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('switching tabs swaps the products without stacking history', async ({ page }) => {
    await page.goto('/shop/');
    await page.getByRole('tab', { name: /Stamp/ }).click();
    await expect(page).toHaveURL(/category=stamp/);
    await expect(page.getByText('ラバースタンプ おなまえ')).toBeVisible();

    // replaceState, not pushState: Back must leave the shop, not undo the tab.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/shop\//);
  });

  test('cards show only image, name and price', async ({ page }) => {
    await page.goto('/shop/');
    const card = page.locator('.c-pcard').first();
    await expect(card.locator('.c-pcard__name')).toHaveText('アルバムフレーク はじめての1年');
    await expect(card.locator('.c-pcard__price')).toContainText('880');
    await expect(card.locator('img')).toHaveAttribute('width', '600');
  });
});

test.describe('Product modal', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('opens from a card and puts the product in the URL', async ({ page }) => {
    await page.goto('/shop/');
    await page.locator('.c-pcard__btn').first().click();

    const modal = page.getByRole('dialog', { name: /はじめての1年/ });
    await expect(modal).toBeVisible();
    await expect(page).toHaveURL(/category=album-flake&product=1001/);

    // Purchase CTA at the top and again at the bottom.
    const buyLinks = modal.getByRole('link', { name: /minneで購入する/ });
    await expect(buyLinks).toHaveCount(2);
    await expect(buyLinks.first()).toHaveAttribute('href', 'https://minne.com/items/1001');
    await expect(modal).toContainText('の説明文です');
  });

  test('a direct product URL selects the tab and opens the modal immediately', async ({ page }) => {
    await page.goto('/shop/?category=stamp&product=2001');
    await expect(page.getByRole('dialog', { name: /おなまえ/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Stamp/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('a mismatched category is corrected to the product’s own, without a history entry', async ({ page }) => {
    await page.goto('/shop/');
    await page.goto('/shop/?category=album-flake&product=2001'); // stamp product

    await expect(page.getByRole('dialog', { name: /おなまえ/ })).toBeVisible();
    await expect(page).toHaveURL(/category=stamp&product=2001/);

    // The wrong URL was replaced, so Back returns to the first shop view.
    await page.goBack();
    await expect(page).toHaveURL(/\/shop\/$/);
  });

  test('an unknown product id renders 404', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=999999');
    await expect(page.getByRole('heading', { name: /商品が見つかりませんでした/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /アルバムフレークを見る/ })).toBeVisible();
  });

  test('closes with the close button, the backdrop and Escape', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    const dialog = page.getByRole('dialog', { name: /はじめての1年/ });

    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.goto('/shop/?category=album-flake&product=1001');
    await page.getByRole('button', { name: '商品の詳細を閉じる' }).click();
    await expect(page.getByRole('dialog', { name: /はじめての1年/ })).toBeHidden();

    await page.goto('/shop/?category=album-flake&product=1001');
    // The backdrop fills the viewport and the panel sits on top of it, so aim
    // at a corner the panel does not cover.
    await page.locator('.c-modal__backdrop').click({ position: { x: 4, y: 4 } });
    await expect(page.getByRole('dialog', { name: /はじめての1年/ })).toBeHidden();
  });

  test('closing returns to the scroll position the card was opened from', async ({ page }) => {
    await page.goto('/shop/');
    await page.locator('.c-pcard').last().scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    // Otherwise the assertion below passes vacuously on a viewport tall enough
    // to show every card without scrolling.
    expect(before).toBeGreaterThan(0);

    await page.locator('.c-pcard__btn').last().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(40);
  });

  test('locks background scrolling while open', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/is-locked/);
  });

  test('gallery counter follows the arrows on desktop', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Arrows are desktop-only; mobile swipes instead.');

    await page.goto('/shop/?category=album-flake&product=1001');
    const counter = page.locator('.c-gallery__counter');
    await expect(counter).toHaveText('1 / 3');

    await page.getByRole('button', { name: '次の画像' }).click();
    await expect(counter).toHaveText('2 / 3');
  });

  test('modal images beyond the first are lazy', async ({ page }) => {
    await page.goto('/shop/?category=album-flake&product=1001');
    const slides = page.locator('.c-gallery__img');
    await expect(slides.first()).toHaveAttribute('loading', 'eager');
    await expect(slides.nth(1)).toHaveAttribute('loading', 'lazy');
  });

  test('every kind of product opens by direct URL', async ({ page }) => {
    for (const product of REPRESENTATIVE_PRODUCTS) {
      await page.goto(`/shop/?category=${product.category}&product=${product.id}`);
      await expect(page.getByRole('dialog')).toBeVisible();
    }
  });
});
