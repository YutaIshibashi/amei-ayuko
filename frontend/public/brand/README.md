# Brand assets (placeholders)

Every file in this folder is a **placeholder**. Replace the file, keep the
filename — nothing in the code references anything but these paths
(`src/lib/site.ts` → `ASSETS`).

| File | Used by | Replace with |
|---|---|---|
| `logo.svg` | header, hero, footer | the real horizontal logo (SVG preferred) |
| `logo-mark.svg` | favicon, emails, admin | the logo mark only |
| `avatar.svg` | About / top teaser | the existing similar-face illustration |
| `hero-placeholder.svg` | hero, until a main visual is uploaded | a real product photo (4:3 or 1:1) |
| `category-album-flake.svg` | top page category card | album flake product photo (4:3) |
| `category-stamp.svg` | top page category card | stamp product photo (4:3) |
| `design-works.svg` | top page Design section | logo/business-card/flyer samples (1:1) |
| `about-*.svg` | About page | photos of hands / tools / desk / finished work |
| `illust-404.svg`, `illust-maintenance.svg` | error + maintenance pages | hand-drawn illustration |
| `ogp-default.png` | default OGP (1200×630) | a designed OGP card |

Raster assets should be exported as WebP **and** PNG/JPEG where they are used
as OGP images (crawlers do not all accept WebP for `og:image`).
