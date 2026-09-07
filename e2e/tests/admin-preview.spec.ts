import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * The admin article-image preview keeps its aspect ratio.
 *
 * The rest of this suite covers the public site, but the admin panel is PHP
 * and has no browser harness of its own — and the bug this pins down is purely
 * a rendered-geometry one: `.preview` capped the width while the markup's
 * `height` attribute kept the full pixel height, so a 1200x1200 upload was
 * drawn 320x1200. Only a real layout engine can tell us that is fixed, so the
 * stylesheet is loaded here against markup shaped exactly like edit.php's.
 */
const adminCss = readFileSync(
  fileURLToPath(new URL('../../backend/public/admin/assets/admin.css', import.meta.url)),
  'utf8',
);

/**
 * An image with a genuine intrinsic size, so the browser has the same two
 * sources of truth it has in the admin: the attributes and the file itself.
 */
function image(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#cf6a53"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** edit.php's markup: the preview sits in a paragraph inside a panel. */
function markup(width: number, height: number): string {
  // The viewport meta is _layout.php's, and it is load-bearing here: without
  // it an emulated phone lays the page out at 980px and `100%` stops meaning
  // "the screen".
  return `
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <main class="wrap">
      <section class="panel">
        <p><img class="preview" src="${image(width, height)}" alt="現在の記事画像"
                width="${width}" height="${height}"></p>
      </section>
    </main>`;
}

const uploads = [
  { label: '正方形 1200x1200', width: 1200, height: 1200 },
  { label: '横長 1200x800', width: 1200, height: 800 },
  { label: '縦長 800x1200', width: 800, height: 1200 },
];

for (const upload of uploads) {
  test(`the article preview keeps the aspect ratio of a ${upload.label} upload`, async ({ page }) => {
    await page.setContent(markup(upload.width, upload.height));
    await page.addStyleTag({ content: adminCss });

    const preview = page.locator('.preview');
    await expect(preview).toBeVisible();

    const box = await preview.boundingBox();
    expect(box).not.toBeNull();
    const { width, height } = box!;

    // Borders add a pixel per side to the box; the tolerance covers that and
    // sub-pixel rounding, and is far tighter than any visible distortion.
    const expectedRatio = upload.width / upload.height;
    expect(width / height).toBeCloseTo(expectedRatio, 1);

    // Scaled down to fit, never up, and never past the 320px cap.
    expect(width).toBeLessThanOrEqual(322);
    expect(height).toBeLessThanOrEqual(322);
    expect(Math.max(width, height)).toBeGreaterThan(300);

    // The panel is the container it must not escape.
    const panel = await page.locator('.panel').boundingBox();
    expect(panel).not.toBeNull();
    expect(width).toBeLessThanOrEqual(panel!.width);
  });
}

test('the preview still fits a viewport narrower than the 320px cap', async ({ page }) => {
  await page.setViewportSize({ width: 280, height: 640 });
  await page.setContent(markup(1200, 1200));
  await page.addStyleTag({ content: adminCss });

  const box = await page.locator('.preview').boundingBox();
  expect(box).not.toBeNull();

  expect(box!.width).toBeLessThanOrEqual(280);
  expect(box!.width / box!.height).toBeCloseTo(1, 1);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
});
