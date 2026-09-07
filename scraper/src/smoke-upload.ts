import sharp from 'sharp';
import { loadConfig } from './config.js';
import { log, registerSecret } from './log.js';
import { SyncApiError, SyncClient } from './syncClient.js';

/**
 * Smoke-tests the image upload path against the real sync API.
 *
 *   SITE_URL=... MINNE_SYNC_API_KEY=... npm run smoke:upload
 *
 * Exists because the dry run cannot cover this: it deliberately stops before
 * any upload, so `sendImage` was first exercised on a live run — which is how
 * a broken multipart body reached production instead of CI.
 *
 * This never publishes. It opens a session, stages one tiny generated WebP,
 * and aborts. `commit` is not called and cannot be reached: there is no code
 * path to it here, the product catalogue is never sent, and the abort runs
 * from a `finally` so it happens even if the upload throws.
 *
 * What it leaves behind is one aborted row in the sync history, which is the
 * point — it is a record that the check ran.
 */

/** Not a real minne id; the server only requires [A-Za-z0-9_-]{1,32}. */
const SMOKE_PRODUCT_ID = 'smoketest';
const SMOKE_FILENAME = '00-thumb.webp';

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2));
  registerSecret(config.apiKey);

  if (config.dryRun) {
    throw new Error('--dry-run is meaningless here: this check exists to exercise a real upload.');
  }

  log.info('smoke test: image upload', { siteUrl: config.siteUrl });

  // A 16×16 solid square. Small enough to be trivial, real enough that the
  // server's getimagesize() check accepts it as a WebP.
  const image = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 232, g: 131, b: 107 } },
  })
    .webp({ quality: 60 })
    .toBuffer();

  log.info('generated a test image', { bytes: image.byteLength });

  const client = new SyncClient(config);
  let syncId: string | null = null;
  let aborted = false;

  try {
    const started = await client.start();
    syncId = started.syncId;
    log.info('sync session opened', { syncId });

    await client.sendImage(syncId, SMOKE_PRODUCT_ID, SMOKE_FILENAME, image);
    log.info('image staged successfully', {
      productId: SMOKE_PRODUCT_ID,
      filename: SMOKE_FILENAME,
    });
  } finally {
    if (syncId !== null) {
      // Always, including on failure: this is what guarantees nothing is left
      // staged and nothing is ever published.
      aborted = await client.abort(syncId, 'image upload smoke test');
      if (aborted) {
        log.info('session aborted; nothing was published', { syncId });
      }
    }
    await client.close();
  }

  // A suppressed abort failure would leave the session and the staged image
  // behind until the server's sweep. This check exists to promise cleanup, so
  // it cannot report success without it.
  if (!aborted) {
    throw new Error(
      `the upload succeeded but the session could not be aborted (syncId ${syncId ?? 'unknown'}). ` +
        'It stays staged until the server sweeps it after 24 hours; nothing was published.',
    );
  }

  log.info('smoke test passed: multipart upload works against the live sync API');
}

main().catch((error: unknown) => {
  if (error instanceof SyncApiError) {
    log.error('smoke test failed', { status: error.status, body: error.body.slice(0, 300) });
  } else {
    log.error('smoke test failed', {
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }
  process.exitCode = 1;
});
