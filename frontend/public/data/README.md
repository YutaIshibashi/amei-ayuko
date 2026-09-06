# /data

`products.json` here is a **development fixture** used by `next dev` and by the
Playwright suite. In production this path is written by the minne sync pipeline
(`/sync/commit.php` swaps it in atomically), so the deploy workflow explicitly
excludes `data/` when uploading the static export — otherwise a deploy would
overwrite live product data with this fixture.
