import sharp from 'sharp';
import { fetchBinary } from './http.js';
import { log } from './log.js';
import type { ScraperConfig } from './config.js';

export interface ProcessedImage {
  /** ~600px wide, used in the shop grid. */
  thumb: { filename: string; buffer: Buffer; width: number; height: number };
  /** ~1600px wide, used in the modal and the zoom layer. */
  large: { filename: string; buffer: Buffer; width: number; height: number };
}

export interface ImageOutcome {
  productId: string;
  index: number;
  ok: boolean;
  /** The first image of a product is its main image; failure is fatal. */
  isMain: boolean;
  image?: ProcessedImage;
  error?: string;
}

const THUMB_WIDTH = 600;
const THUMB_QUALITY = 78;
const LARGE_WIDTH = 1600;
const LARGE_QUALITY = 88;

/**
 * Downloads one image and produces the two WebP variants the site uses.
 *
 * Both are generated here rather than on the server: this process has the
 * bandwidth and the CPU budget of a CI runner, while Lolipop does not, and it
 * means the origin images never need to be stored anywhere.
 */
export async function downloadAndConvert(
  productId: string,
  url: string,
  index: number,
  config: ScraperConfig,
): Promise<ImageOutcome> {
  const isMain = index === 0;

  try {
    const original = await fetchBinary(url, {
      timeoutMs: config.requestTimeoutMs,
      userAgent: config.userAgent,
      attempts: config.maxRetries,
      retryDelaysMs: config.retryDelaysMs,
    });

    const base = sharp(original, { failOn: 'error' }).rotate(); // honour EXIF orientation
    const metadata = await base.metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('unreadable image');
    }

    const thumbPipeline = sharp(original)
      .rotate()
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY, effort: 4 });

    const largePipeline = sharp(original)
      .rotate()
      .resize({ width: LARGE_WIDTH, withoutEnlargement: true })
      .webp({ quality: LARGE_QUALITY, effort: 4 });

    const [thumbResult, largeResult] = await Promise.all([
      thumbPipeline.toBuffer({ resolveWithObject: true }),
      largePipeline.toBuffer({ resolveWithObject: true }),
    ]);

    const stem = `${String(index).padStart(2, '0')}`;

    return {
      productId,
      index,
      ok: true,
      isMain,
      image: {
        thumb: {
          filename: `${stem}-thumb.webp`,
          buffer: thumbResult.data,
          width: thumbResult.info.width,
          height: thumbResult.info.height,
        },
        large: {
          filename: `${stem}-large.webp`,
          buffer: largeResult.data,
          width: largeResult.info.width,
          height: largeResult.info.height,
        },
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn('image failed', { productId, index, isMain, error: message });
    return { productId, index, ok: false, isMain, error: message };
  }
}

/**
 * Runs `worker` over `items` with a fixed concurrency.
 *
 * Three at a time: enough to keep the run short, low enough to stay a polite
 * neighbour on someone else's CDN.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  });

  await Promise.all(runners);
  return results;
}
