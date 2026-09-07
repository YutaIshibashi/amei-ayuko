/**
 * Static file server for the E2E suite.
 *
 * Mirrors the parts of the production .htaccess the tests depend on:
 * `/about` → `/about/index.html`, an unknown path → 404.html with a real 404
 * status, `/news/{id}` → the exported article shell and `/shop/?…&product=`
 * → the exported product shell, each with a head standing in for the one
 * render.php injects. The two shells are also 301'd away from their own URLs.
 *
 * The injected head matters because the suite has no PHP: what the browser
 * tests is whether hydration leaves a dynamic head alone, and that needs a
 * document whose head has been replaced the way production replaces it. The
 * values below are fixtures, not production's — `Seo::inject` itself is
 * checked against the real export in backend/tests/seo-inject-test.php.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INJECTED } from './injected-head.mjs';

const root = fileURLToPath(new URL('../frontend/out/', import.meta.url));
const port = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

async function readIfFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

async function resolve(pathname) {
  // Reject traversal before touching the filesystem.
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;

  const direct = await readIfFile(join(root, safe));
  if (direct) return { body: direct, path: safe };

  const index = await readIfFile(join(root, safe, 'index.html'));
  if (index) return { body: index, path: `${safe}/index.html` };

  return null;
}

/* ------------------------------------------------- the dynamic-SEO renderer */

const escape = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Replaces the head of an exported document, as Seo::inject does: drop the
 * tags the export produced so there is exactly one of each, then add ours.
 */
function inject(html, meta) {
  const stripped = String(html)
    .replace(/<title>.*?<\/title>/is, '')
    .replace(/<meta name="(description|robots|twitter:[^"]*)"[^>]*>/gi, '')
    .replace(/<meta property="og:[^"]*"[^>]*>/gi, '')
    .replace(/<link rel="canonical"[^>]*>/gi, '')
    .replace(/<script type="application\/ld\+json">.*?<\/script>/gis, '');

  const head = [
    `<title>${escape(meta.title)}</title>`,
    `<meta name="description" content="${escape(meta.description)}">`,
    '<meta name="robots" content="index, follow, max-image-preview:large">',
    `<link rel="canonical" href="${escape(meta.canonical)}">`,
    `<meta property="og:type" content="${meta.ogType}">`,
    `<meta property="og:title" content="${escape(meta.title)}">`,
    `<meta property="og:description" content="${escape(meta.description)}">`,
    `<meta property="og:url" content="${escape(meta.canonical)}">`,
    `<meta property="og:image" content="${escape(meta.image)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escape(meta.title)}">`,
    `<meta name="twitter:description" content="${escape(meta.description)}">`,
    `<meta name="twitter:image" content="${escape(meta.image)}">`,
    ...meta.jsonLd.map(
      (graph) =>
        `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`,
    ),
  ].join('\n');

  return stripped.replace(/<\/head>/i, `${head}\n</head>`);
}

/** What render.php would return for this URL, or null if it does not claim it. */
async function render(url) {
  if (/^\/news\/\d+\/?$/.test(url.pathname)) {
    const shell = await readIfFile(join(root, 'news/detail/index.html'));
    if (shell) return { body: inject(shell, INJECTED.news), path: 'news/detail/index.html' };
  }

  if (/^\/shop\/?$/.test(url.pathname) && url.searchParams.get('product')) {
    const shell = await readIfFile(join(root, 'shop/product/index.html'));
    if (shell) return { body: inject(shell, INJECTED.product), path: 'shop/product/index.html' };
  }

  return null;
}

/** The shells are 301'd away from their own URLs, as .htaccess does. */
const REDIRECTS = new Map([
  ['/news/detail', '/news/'],
  ['/news/detail/', '/news/'],
  ['/news/detail/index.html', '/news/'],
  ['/shop/product', '/shop/'],
  ['/shop/product/', '/shop/'],
  ['/shop/product/index.html', '/shop/'],
]);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  const redirect = REDIRECTS.get(url.pathname);
  if (redirect) {
    res.writeHead(301, { location: redirect });
    res.end();
    return;
  }

  const found = (await render(url)) ?? (await resolve(url.pathname));

  if (found) {
    res.writeHead(200, {
      'content-type': TYPES[extname(found.path)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(found.body);
    return;
  }

  const notFound = await readIfFile(join(root, '404.html'));
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
  res.end(notFound ?? 'Not Found');
}).listen(port, '127.0.0.1', () => {
  console.log(`E2E server on http://127.0.0.1:${port} (root: ${root})`);
});
