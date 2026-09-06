import { expect, test } from '@playwright/test';
import { mockApi, mockContactFailure, mockContactSuccess } from './fixtures.js';

/**
 * Fields are addressed by id rather than by label text: the visible label
 * carries a 必須 / 任意 badge, so its accessible name is "お名前必須" and a
 * label-based locator would be describing the badge as much as the field.
 * `a11y.spec.ts` separately asserts that every control does have a label.
 */

test.describe('Contact', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
  });

  test('reports every missing field and moves focus to the first one', async ({ page }) => {
    await page.goto('/contact/');
    await page.getByRole('button', { name: '入力内容を確認する' }).click();

    const summary = page.locator('#contact-error-summary');
    await expect(summary).toContainText('入力内容をご確認ください');
    await expect(summary).toContainText('お名前をご入力ください。');
    await expect(summary).toContainText('メールアドレスをご入力ください。');
    await expect(summary).toContainText('プライバシーポリシーへの同意が必要です。');

    await expect(page.locator('#field-name')).toBeFocused();
    await expect(page.locator('#field-name')).toHaveAttribute('aria-invalid', 'true');
  });

  test('rejects a malformed address and a mismatched confirmation', async ({ page }) => {
    await page.goto('/contact/');
    await page.locator('#field-name').fill('雨井 あゆこ');
    await page.locator('#field-email').fill('not-an-email');
    await page.locator('#field-emailConfirm').fill('other@example.com');
    await page.locator('#field-message').fill('テストの本文です。');
    await page.locator('#field-agree').check();
    await page.getByRole('button', { name: '入力内容を確認する' }).click();

    const summary = page.locator('#contact-error-summary');
    await expect(summary).toContainText('メールアドレスの形式をご確認ください');
    await expect(summary).toContainText('メールアドレスが一致していません');
  });

  test('help text follows the selected enquiry type', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.getByText('用途やイメージをご記載ください')).toBeVisible();
    await page.locator('#field-contactTypeId').selectOption({ label: '商品について' });
    await expect(page.getByText('商品名や商品URLをご記載ください')).toBeVisible();
  });

  test('shows a confirmation step before anything is sent', async ({ page }) => {
    await mockContactSuccess(page);
    await page.goto('/contact/');

    await page.locator('#field-name').fill('雨井 あゆこ');
    await page.locator('#field-email').fill('test@example.com');
    await page.locator('#field-emailConfirm').fill('test@example.com');
    await page.locator('#field-message').fill('ロゴ制作についてのご相談です。');
    await page.locator('#field-agree').check();
    await page.getByRole('button', { name: '入力内容を確認する' }).click();

    const dialog = page.getByRole('dialog', { name: 'この内容で送信します' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('雨井 あゆこ');
    await expect(dialog).toContainText('test@example.com');
    await expect(dialog).toContainText('ロゴ制作についてのご相談です。');

    await dialog.getByRole('button', { name: '送信する' }).click();
    await expect(page).toHaveURL(/\/contact\/thanks\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('お問い合わせありがとうございます');
    await expect(page.getByText('2〜3営業日')).toBeVisible();
  });

  test('a failed send keeps the input and offers the Instagram route', async ({ page }) => {
    await mockContactFailure(page);
    await page.goto('/contact/');

    await page.locator('#field-name').fill('雨井 あゆこ');
    await page.locator('#field-email').fill('test@example.com');
    await page.locator('#field-emailConfirm').fill('test@example.com');
    await page.locator('#field-message').fill('送信失敗のテストです。');
    await page.locator('#field-agree').check();
    await page.getByRole('button', { name: '入力内容を確認する' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '送信する' }).click();

    const summary = page.locator('#contact-error-summary');
    await expect(summary).toContainText('送信できませんでした');
    await expect(summary.getByRole('link', { name: 'InstagramのDM' })).toBeVisible();
    // Nothing typed may be lost on a failure.
    await expect(page.locator('#field-name')).toHaveValue('雨井 あゆこ');
    await expect(page.locator('#field-message')).toHaveValue('送信失敗のテストです。');
  });

  test('never persists personal data to storage', async ({ page }) => {
    await page.goto('/contact/');
    await page.locator('#field-name').fill('雨井 あゆこ');
    await page.locator('#field-email').fill('private@example.com');
    await page.waitForTimeout(300);

    const stored = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(stored).not.toContain('private@example.com');
    expect(stored).not.toContain('雨井');
  });
});
