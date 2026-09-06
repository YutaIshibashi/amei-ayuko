#!/usr/bin/env bash
# Local development for the PHP side.
#
# The deployed layout is:
#     web/           ← document root (static export + public PHP)
#     web/_app/      ← private application dir (src, vendor, templates, .env)
#
# This script reproduces that layout in `.dev-root/` using symlinks, then runs
# PHP's built-in server against it, so the same `require '/_app/bootstrap.php'`
# paths work locally without changing any code.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV="$ROOT/.dev-root"
PORT="${PORT:-8080}"

rm -rf "$DEV"
mkdir -p "$DEV"

# Static export (build it first with: cd frontend && npm run build)
if [ -d "$ROOT/frontend/out" ]; then
  cp -R "$ROOT/frontend/out/." "$DEV/"
else
  echo "warning: frontend/out not found — run 'npm run build' in frontend/ first" >&2
fi

# Public PHP over the top
cp -R "$ROOT/backend/public/." "$DEV/"

# Private application directory
mkdir -p "$DEV/_app"
ln -sfn "$ROOT/backend/src"        "$DEV/_app/src"
ln -sfn "$ROOT/backend/templates"  "$DEV/_app/templates"
ln -sfn "$ROOT/backend/vendor"     "$DEV/_app/vendor"
mkdir -p "$DEV/_app/storage/logs" "$DEV/_app/storage/sync" "$DEV/_app/storage/cache"

# Copied, not symlinked: bootstrap.php derives APP_DIR from __DIR__, and PHP
# resolves symlinks before setting it.
cp "$ROOT/backend/bootstrap.php" "$DEV/_app/bootstrap.php"

if [ -f "$ROOT/backend/.env" ]; then
  ln -sfn "$ROOT/backend/.env" "$DEV/_app/.env"
else
  echo "warning: backend/.env not found — copy .env.example and fill it in" >&2
fi

mkdir -p "$DEV/uploads/news" "$DEV/uploads/main-visual" "$DEV/products" "$DEV/data"

echo "Serving $DEV on http://localhost:$PORT"
php -S "localhost:$PORT" -t "$DEV" "$ROOT/ops/router.php"
