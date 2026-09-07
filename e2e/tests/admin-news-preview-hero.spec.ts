import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * The admin article preview renders its hero image the way the public site
 * will.
 *
 * preview.php exists to answer one question — "what will this look like once
 * it is published?" — so its hero is checked against the real public rules
 * rather than against a description of them: both stylesheets are loaded
 * here, both heroes are measured, and the two have to agree.
 *
 * The bug: `.hero` sat on the `<img>` and set the width alone, leaving the
 * `height` attribute at the file's own pixel height. A 1200x1200 upload was
 * drawn 720x1200 — a square stretched down the page.
 */
const repo = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url));

/** preview.php's own `<style>` block, so the test reads what the page ships. */
function previewStyles(): string {
  const php = readFileSync(repo('backend/public/admin/news/preview.php'), 'utf8');
  const match = /<style>([\s\S]*?)<\/style>/.exec(php);
  if (match?.[1] === undefined) {
    throw new Error('preview.php has no <style> block');
  }
  return match[1];
}

/** The public stylesheet, in globals.css's order. */
function publicStyles(): string {
  return ['tokens.css', 'base.css', 'layout-parts.css', 'components.css', 'sections.css']
    .map((name) => readFileSync(repo(`frontend/src/styles/${name}`), 'utf8'))
    .join('\n');
}

function image(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#cf6a53"/>` +
    `<circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.35}" fill="#fff"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** preview.php's markup around the hero. */
function previewPage(width: number, height: number): string {
  return `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${previewStyles()}</style>
    <article class="wrap">
      <h1>プレビュー</h1>
      <div class="hero">
        <img src="${image(width, height)}" alt="" width="${width}" height="${height}">
      </div>
      <div class="body"><p>本文</p></div>
    </article>`;
}

/** NewsDetailClient's markup around the same image. */
function publicPage(width: number, height: number): string {
  return `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${publicStyles()}</style>
    <article class="l-section l-section--paper">
      <div class="l-page c-article">
        <h1>プレビュー</h1>
        <div class="a-ratio a-ratio--16x9 c-article__hero">
          <img src="${image(width, height)}" alt="" width="${width}" height="${height}">
        </div>
        <div><p>本文</p></div>
      </div>
    </article>`;
}

const uploads = [
  { label: '正方形 1200x1200', width: 1200, height: 1200 },
  { label: '横長 1200x800', width: 1200, height: 800 },
  { label: '縦長 800x1200', width: 800, height: 1200 },
];

for (const upload of uploads) {
  test(`the preview hero is a 16:9 crop for a ${upload.label} upload`, async ({ page }) => {
    await page.setContent(previewPage(upload.width, upload.height));

    const hero = page.locator('.hero');
    await expect(hero).toBeVisible();

    const box = (await hero.boundingBox())!;
    expect(box).not.toBeNull();
    expect(box.width / box.height).toBeCloseTo(16 / 9, 1);

    // The image fills that box exactly — no letterboxing, no distortion — and
    // is cropped rather than squashed.
    const img = (await hero.locator('img').boundingBox())!;
    expect(img.width).toBeCloseTo(box.width, 0);
    expect(img.height).toBeCloseTo(box.height, 0);
    expect(await hero.locator('img').evaluate((el) => getComputedStyle(el).objectFit)).toBe('cover');

    // `object-position` is left at its default, which is the centre — the same
    // crop the public site performs.
    expect(await hero.locator('img').evaluate((el) => getComputedStyle(el).objectPosition))
      .toBe('50% 50%');

    // Inside the article column, and no horizontal scrollbar anywhere.
    const wrap = (await page.locator('.wrap').boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(wrap.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });

  test(`the preview hero matches the public article's for a ${upload.label} upload`, async ({ page }) => {
    /**
     * The two pages have their own gutters, so the heroes are not the same
     * number of pixels wide — what has to match is the rule they are drawn
     * by: a 16:9 box spanning the article column, cropped from the centre,
     * with the same hand-drawn corner.
     */
    async function hero(content: string, selector: string, column: string) {
      await page.setContent(content);
      const locator = page.locator(selector);
      const box = (await locator.boundingBox())!;
      const columnBox = (await page.locator(column).boundingBox())!;
      return {
        ...(await locator.evaluate((el) => {
          const img = el.querySelector('img')!;
          return {
            radius: getComputedStyle(el).borderRadius,
            overflow: getComputedStyle(el).overflow,
            fit: getComputedStyle(img).objectFit,
            position: getComputedStyle(img).objectPosition,
          };
        })),
        ratio: Math.round((box.width / box.height) * 100) / 100,
        // Does it span the column it sits in? Rounded, because the two
        // columns are not the same width.
        spansColumn: Math.abs(box.width - columnBox.width) < 65,
      };
    }

    const admin = await hero(previewPage(upload.width, upload.height), '.hero', '.wrap');
    const site = await hero(publicPage(upload.width, upload.height), '.c-article__hero', '.c-article');

    expect(admin).toEqual(site);
    expect(admin.ratio).toBeCloseTo(16 / 9, 1);
  });
}

test('the preview hero survives a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(previewPage(1200, 1200));

  const box = (await page.locator('.hero').boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  expect(box.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});

test('preview.php wraps the image rather than sizing it directly', () => {
  const php = readFileSync(repo('backend/public/admin/news/preview.php'), 'utf8');

  // The regression in one line: `class="hero"` on the `<img>` is what let the
  // height attribute through.
  expect(php).not.toMatch(/<img[^>]*class="hero"/);
  expect(php).toMatch(/<div class="hero">\s*<img/);
});
