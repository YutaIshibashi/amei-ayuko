import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';

test.describe('News', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('lists ten articles per page', async ({ page }) => {
    await page.goto('/news/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('お知らせ');
    await expect(page.locator('.c-newsItem')).toHaveCount(10);
  });

  test('image-less articles get no placeholder thumbnail', async ({ page }) => {
    await page.goto('/news/');
    // The fixture gives an image to every third article.
    const withImage = page.locator('.c-newsItem__link:not(.c-newsItem__link--noimg)');
    const withoutImage = page.locator('.c-newsItem__link--noimg');
    await expect(withImage.first()).toBeVisible();
    await expect(withoutImage.first()).toBeVisible();
    await expect(withoutImage.first().locator('img')).toHaveCount(0);
  });

  test('paginates', async ({ page }) => {
    await page.goto('/news/');
    await page.getByRole('link', { name: '2ページ目' }).click();
    await expect(page).toHaveURL(/\/news\/\?page=2/);
    await expect(page.locator('.c-newsItem')).toHaveCount(10);

    await page.getByRole('link', { name: '3ページ目' }).click();
    await expect(page.locator('.c-newsItem')).toHaveCount(3);
  });

  test('opens an article, shows the breadcrumb and the related product CTA', async ({ page }) => {
    await page.goto('/news/');
    await page.locator('.c-newsItem__link').first().click();

    await expect(page).toHaveURL(/\/news\/\d+$/);
    await expect(page.getByRole('navigation', { name: 'パンくずリスト' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('テストのお知らせ');
    await expect(page.locator('.c-articleBody h2')).toBeVisible();

    await page.getByRole('link', { name: /この商品を見る/ }).click();
    await expect(page).toHaveURL(/\/shop\/\?category=album-flake&product=1001/);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('offers LINE, X and copy-link sharing', async ({ page }) => {
    await page.goto('/news/100');
    const share = page.locator('.c-share');
    await expect(share.getByRole('link', { name: 'LINE' })).toBeVisible();
    await expect(share.getByRole('link', { name: /Xでシェア/ })).toBeVisible();
    await expect(share.getByRole('button', { name: /URLをコピー/ })).toBeVisible();
  });

  test('an unknown article id renders 404', async ({ page }) => {
    await page.goto('/news/999999');
    await expect(page.getByRole('heading', { name: /記事が見つかりませんでした/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'お知らせ一覧へ' })).toBeVisible();
  });
});

test.describe('Error pages', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('an unknown path returns a branded 404 with a real 404 status', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /ページが見つかりませんでした/ })).toBeVisible();

    // The 404 has to be a way back into the shop, not a dead end.
    const links = page.locator('.c-status__links');
    await expect(links.getByRole('link', { name: 'ホームへ' })).toBeVisible();
    await expect(links.getByRole('link', { name: 'オンラインショップ' })).toBeVisible();
    await expect(links.getByRole('link', { name: 'アルバムフレーク' })).toBeVisible();
    await expect(links.getByRole('link', { name: 'スタンプ' })).toBeVisible();
  });
});
