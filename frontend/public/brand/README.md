# Brand assets

Some of these are the real artwork now; the rest are still placeholders. The
table says which is which, so that nobody spends time replacing a file that
has already been replaced — or ships a placeholder thinking it is finished.

Paths are referenced from `src/lib/site.ts` (`ASSETS`, `EDGE_DECO`) and from
the two components that own a photo each (`home/CategoryCards.tsx`,
`home/DesignSection.tsx`). Replacing a file in place needs no code change,
**as long as the new file keeps the same aspect ratio** — several of these are
drawn into a box whose ratio is fixed in CSS, and the `width`/`height`
attributes in the markup have to keep matching the file.

## The real artwork

| File | Used by | Notes |
|---|---|---|
| `logo-ayuko.png` | header, footer | the `ayuko` wordmark, 517×168 |
| `logo-top.png` | hero, opening animation | the round mark, 640×640 |
| `profile-ayuko.png` | About / top teaser | padded to a square, because its box crops to 1:1 |
| `product-album-flake.jpg` | top page category card | 4:3, cropped to the card's own ratio |
| `product-stamp.jpg` | top page category card | 4:3, same |
| `design-works.jpg` | top page Design section | 1:1, cropped to the blob's ratio |
| `deco-left-*.png`, `deco-right-*.png`, `deco-baby.png` | the stamps that slide in from the screen edges | the `left`/`right` in the name is the edge each one is drawn to peek around, not a layout choice — see `EDGE_DECO` |

## Still placeholders

| File | Used by | Replace with |
|---|---|---|
| `logo.svg` | nothing on the public site any more | — (kept until the admin screens are looked at) |
| `logo-mark.svg` | favicon, emails, admin | the logo mark only |
| `avatar.svg` | nothing — superseded by `profile-ayuko.png` | — |
| `hero-placeholder.svg` | hero, until a main visual is uploaded | a real photo (4:3 or 1:1) |
| `category-album-flake.svg`, `category-stamp.svg` | the E2E product fixtures only | — |
| `about-*.svg` | About page | photos of hands / tools / desk / finished work |
| `illust-404.svg`, `illust-maintenance.svg` | error + maintenance pages | hand-drawn illustration |
| `ogp-default.png` | default OGP (1200×630) | a designed OGP card |

`og:image` must stay PNG or JPEG — not every crawler accepts WebP there.
