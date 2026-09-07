#!/usr/bin/env bash
#
# Assembles the deployable release tree.
#
#   ops/build-release.sh <target-dir> [--no-frontend]
#
# This exists as a script, rather than as steps inside deploy.yml, because the
# repository layout and the deployed layout are not the same shape:
#
#   repository                        deployed
#   ─────────────────────────────     ──────────────────────────────
#   backend/public/api/settings.php   <docroot>/api/settings.php
#   backend/bootstrap.php             <docroot>/_app/bootstrap.php
#   backend/src/                      <docroot>/_app/src/
#
# Every PHP entry point resolves `_app/bootstrap.php` relative to its own
# depth *in the deployed tree*, which is invisible while working in the
# repository. Getting that count wrong is silent locally and a 500 in
# production — it has happened. With the assembly in one place, the test suite
# can build the same tree and check every entry point against it, so the
# mistake cannot reach a server again.
#
# --no-frontend skips the static export, for callers that only need the PHP
# side (the release-layout test).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "usage: ops/build-release.sh <target-dir> [--no-frontend]" >&2
  exit 2
fi

WITH_FRONTEND=1
[ "${2:-}" = "--no-frontend" ] && WITH_FRONTEND=0

mkdir -p "$TARGET"

# 1. The static export becomes the document root …
if [ "$WITH_FRONTEND" -eq 1 ]; then
  if [ ! -d "$ROOT/frontend/out" ]; then
    echo "error: frontend/out not found — run 'npm run build' in frontend/ first" >&2
    exit 1
  fi
  cp -R "$ROOT/frontend/out/." "$TARGET/"

  # … except /data, which the sync pipeline owns in production. Shipping the
  # development fixture would overwrite the live catalogue.
  rm -rf "$TARGET/data"
fi

# 2. Public PHP over the top (api/, admin/, render.php, .htaccess …)
cp -R "$ROOT/backend/public/." "$TARGET/"

# 3. The private application directory, denied by .htaccess.
mkdir -p "$TARGET/_app"
cp "$ROOT/backend/bootstrap.php" "$TARGET/_app/"
cp -R "$ROOT/backend/src" "$TARGET/_app/src"
cp -R "$ROOT/backend/templates" "$TARGET/_app/templates"
if [ -d "$ROOT/backend/vendor" ]; then
  cp -R "$ROOT/backend/vendor" "$TARGET/_app/vendor"
else
  echo "warning: backend/vendor not found — run 'composer install' in backend/" >&2
fi

# Writable runtime directories. Nothing in them is deployed; the deploy's rsync
# excludes keep the server's copies untouched.
mkdir -p "$TARGET/_app/storage/logs" \
         "$TARGET/_app/storage/sync" \
         "$TARGET/_app/storage/cache/htmlpurifier"

# Never ship secrets or a local environment file.
find "$TARGET" -name '.env' -delete
find "$TARGET" -name '*.md' -not -path "*/vendor/*" -delete

echo "release assembled at $TARGET"
