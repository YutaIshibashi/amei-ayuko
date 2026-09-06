/**
 * Static file server for the E2E suite.
 *
 * Mirrors the parts of the production .htaccess the tests depend on:
 * `/about` → `/about/index.html`, an unknown path → 404.html with a real 404
 * status, and `/news/{id}` → the exported article shell (which is what
 * render.php serves in production, minus the injected head).
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  // /news/{id} is served from the shared article shell, as render.php does.
  if (/^\/news\/\d+\/?$/.test(safe)) {
    const shell = await readIfFile(join(root, 'news/detail/index.html'));
    if (shell) return { body: shell, path: 'news/detail/index.html' };
  }

  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const found = await resolve(url.pathname);

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
