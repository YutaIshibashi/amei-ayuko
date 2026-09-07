/**
 * minne → amei ayuko sync.
 *
 * Run nightly at 00:00 JST by GitHub Actions, and on demand via
 * workflow_dispatch. The sequence is:
 *
 *   1. collect product URLs from the shop listing
 *   2. fetch each product page (~1s apart)
 *   3. download every image, convert to two WebP sizes (3 at a time)
 *   4. open a sync run and stage products + images
 *   5. commit — the server validates and only then swaps production over
 *
 * Any failure aborts the run. Production keeps the previous catalogue: there
 * is no intermediate state in which the shop is half-updated.
 */
import { describe, loadConfig } from './config.js';
import { downloadAndConvert, mapWithConcurrency, type ImageOutcome } from './images.js';
import { sleep } from './http.js';
import { log, registerSecret } from './log.js';
import { collectProducts, scrapeProduct, type ScrapedProduct } from './minne.js';
import { SyncApiError, SyncClient, type ProductPayload } from './syncClient.js';

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2));
  registerSecret(config.apiKey);

  log.info('starting minne sync', describe(config));

  /* --- 1. listing ------------------------------------------------------- */
  log.group('Collecting product URLs');
  const allListed = await collectProducts(config);
  const listed = config.maxProducts === null ? allListed : allListed.slice(0, config.maxProducts);
  log.info('collected products from the shop listing', {
    count: listed.length,
    ...(config.maxProducts === null ? {} : { limitedFrom: allListed.length }),
  });
  log.groupEnd();

  if (listed.length === 0) {
    // Zero products is one of the explicit failure conditions: never publish it.
    throw new Error('No products found on the shop listing. Refusing to continue.');
  }

  /* --- 2. product pages ------------------------------------------------- */
  log.group('Fetching product pages');
  const scraped: ScrapedProduct[] = [];
  for (const [index, item] of listed.entries()) {
    const product = await scrapeProduct(item, config);
    if (product) {
      scraped.push(product);
      log.info('scraped', {
        id: product.id,
        name: product.name.slice(0, 40),
        price: product.price,
        images: product.imageUrls.length,
      });
    }
    // Politeness gap between product pages.
    if (index < listed.length - 1) await sleep(config.requestDelayMs);
  }
  log.groupEnd();

  if (scraped.length === 0) {
    throw new Error('Every product page failed to parse. Refusing to continue.');
  }

  /* --- 3. images -------------------------------------------------------- */
  log.group('Downloading and converting images');
  const jobs = scraped.flatMap((product) =>
    product.imageUrls.map((url, index) => ({ product, url, index })),
  );

  const outcomes = await mapWithConcurrency(jobs, config.imageConcurrency, (job) =>
    downloadAndConvert(job.product.id, job.url, job.index, config),
  );

  const imageSuccess = outcomes.filter((o) => o.ok).length;
  const imageFailure = outcomes.length - imageSuccess;
  const mainImageFailure = outcomes.filter((o) => o.isMain && !o.ok).length;
  const successRate = outcomes.length === 0 ? 0 : imageSuccess / outcomes.length;

  log.info('image results', {
    total: outcomes.length,
    success: imageSuccess,
    failure: imageFailure,
    mainFailures: mainImageFailure,
    successRate: `${(successRate * 100).toFixed(1)}%`,
  });
  log.groupEnd();

  // Fail before opening a sync run when the outcome is already unpublishable.
  // The server re-checks all of this; catching it here just saves an upload.
  if (mainImageFailure > 0) {
    throw new Error(`${mainImageFailure} product(s) lost their main image. Refusing to publish.`);
  }
  if (successRate < 0.95) {
    throw new Error(`Image success rate ${(successRate * 100).toFixed(1)}% is below the 95% threshold.`);
  }

  if (config.dryRun || config.maxProducts !== null) {
    log.info('dry run / limited run: nothing was uploaded', {
      products: scraped.length,
      images: imageSuccess,
    });
    return;
  }

  /* --- 4. stage --------------------------------------------------------- */
  const client = new SyncClient(config);
  const started = await client.start();
  const syncId = started.syncId;
  log.info('sync run opened', {
    syncId,
    previousSuccess: started.previousSuccess,
    previousCount: started.previousCount,
  });

  try {
    const byProduct = groupOutcomes(outcomes);

    const payload: ProductPayload[] = scraped.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price,
      url: product.url,
      inStock: product.inStock,
      sortOrder: product.sortOrder,
      images: (byProduct.get(product.id) ?? [])
        .filter((outcome) => outcome.ok && outcome.image)
        .map((outcome) => ({
          thumb: outcome.image!.thumb.filename,
          large: outcome.image!.large.filename,
        })),
    }));

    log.group('Uploading product data');
    const staged = await client.sendProducts(syncId, payload);
    log.info('products staged', staged);
    log.groupEnd();

    log.group('Uploading images');
    let uploaded = 0;
    for (const outcome of outcomes) {
      if (!outcome.ok || !outcome.image) continue;
      await client.sendImage(syncId, outcome.productId, outcome.image.thumb.filename, outcome.image.thumb.buffer);
      await client.sendImage(syncId, outcome.productId, outcome.image.large.filename, outcome.image.large.buffer);
      uploaded += 1;
      if (uploaded % 20 === 0) log.info('upload progress', { uploaded, of: imageSuccess });
    }
    log.info('images uploaded', { uploaded });
    log.groupEnd();

    /* --- 5. commit ------------------------------------------------------ */
    const result = await client.commit(syncId, { imageSuccess, imageFailure, mainImageFailure });
    log.info('sync committed', {
      total: result.total,
      added: result.added,
      removed: result.removed,
    });

    await writeSummary(result.total, result.added, result.removed, imageSuccess, imageFailure);
  } catch (error) {
    // Release the staging area rather than leaving it for the 24h sweep.
    await client.abort(syncId, summarise(error));
    throw error;
  } finally {
    // The client keeps its own dispatcher, so its sockets have to be closed
    // explicitly or the process lingers after the run.
    await client.close();
  }
}

function groupOutcomes(outcomes: ImageOutcome[]): Map<string, ImageOutcome[]> {
  const map = new Map<string, ImageOutcome[]>();
  for (const outcome of outcomes) {
    const list = map.get(outcome.productId) ?? [];
    list.push(outcome);
    map.set(outcome.productId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.index - b.index);
  return map;
}

function summarise(error: unknown): string {
  if (error instanceof SyncApiError) {
    return `${error.message}: ${error.body.slice(0, 200)}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** Writes the GitHub Actions job summary, so a run is readable at a glance. */
async function writeSummary(
  total: number,
  added: number,
  removed: number,
  imageSuccess: number,
  imageFailure: number,
): Promise<void> {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  const { appendFile } = await import('node:fs/promises');
  await appendFile(
    path,
    [
      '## minne 同期結果',
      '',
      '| 項目 | 件数 |',
      '| --- | ---: |',
      `| 商品総数 | ${total} |`,
      `| 追加 | ${added} |`,
      `| 削除 | ${removed} |`,
      `| 画像成功 | ${imageSuccess} |`,
      `| 画像失敗 | ${imageFailure} |`,
      '',
    ].join('\n'),
    'utf8',
  );
}

main().catch((error: unknown) => {
  log.error('sync failed', { error: summarise(error) });
  if (error instanceof SyncApiError) {
    log.error('server response', { status: error.status, body: error.body.slice(0, 500) });
  }
  process.exitCode = 1;
});
