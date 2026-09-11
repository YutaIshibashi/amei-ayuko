# Brand assets

Some of these are the real artwork now; the rest are still placeholders. The
table says which is which, so that nobody spends time replacing a file that
has already been replaced — or ships a placeholder thinking it is finished.

Most paths come from `src/lib/site.ts` (`ASSETS`, `EDGE_DECO`), but not all:
the two photo slots are owned by their components, and the backend references
some of these directly for structured data and for the auto-reply email. The
"used by" column is the list to check before deleting anything.

Replacing a file in place needs no code change, **as long as the new file
keeps the same aspect ratio** — several are drawn into a box whose ratio is
fixed in CSS, and the `width`/`height` attributes in the markup have to keep
matching the file.

## The real artwork

| File | Used by |
|---|---|
| `logo-ayuko.png` | header, footer (`ASSETS.headerIcon`), 517×168 |
| `logo-top.png` | hero, opening animation (`ASSETS.topIcon`), 640×640 |
| `profile-ayuko.png` | About page, top teaser (`ASSETS.avatar`); padded to a square, because its box crops to 1:1 |
| `product-album-flake.jpg` | top page category card (`home/CategoryCards.tsx`), 4:3 |
| `product-stamp.jpg` | top page category card (`home/CategoryCards.tsx`), 4:3 |
| `design-works.jpg` | top page Design section (`home/DesignSection.tsx`), 1:1 |
| `deco-left-*.png`, `deco-right-*.png`, `deco-baby.png` | the stamps that slide in from the screen edges (`EDGE_DECO`); the `left`/`right` in the name is the edge each one is drawn to peek around, not a layout choice |

## Still placeholders

| File | Used by | Replace with |
|---|---|---|
| `logo.svg` | **Organization structured data** on the top page (`app/page.tsx`) and on every article (`backend/src/Seo.php`), the contact auto-reply email (`backend/public/api/contact.php`), and `ASSETS.logo` | the real horizontal logo — this one is read by search engines and sent to customers, so it is the most visible placeholder left |
| `logo-mark.svg` | admin favicon and admin header (`backend/public/admin/_layout.php`) | the logo mark only |
| `ogp-default.png` | default `og:image` everywhere, and the fallback when no OGP image is set in the admin | a designed OGP card (1200×630) |
| `hero-placeholder.svg` | hero, until a main visual is uploaded in the admin (`ASSETS.heroFallback`) | a real photo (4:3 or 1:1) |
| `about-desk.svg`, `about-hands.svg`, `about-tools.svg`, `about-works.svg` | About page, and the sample rows in `public/data/products.json` | photos of hands / tools / desk / finished work |
| `category-album-flake.svg`, `category-stamp.svg` | no longer on the top page — only the sample rows in `public/data/products.json` and the E2E fixtures | — (safe to leave; the real cards use the photos above) |
| `illust-404.svg` | 404 and other status pages (`components/StatusPage.tsx`) | hand-drawn illustration |
| `illust-maintenance.svg` | maintenance page, contact thanks page | hand-drawn illustration |
| `avatar.svg` | nothing — superseded by `profile-ayuko.png` | — (safe to delete) |

`og:image` must stay PNG or JPEG — not every crawler accepts WebP there.
