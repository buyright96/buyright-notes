# 03_STOREFRONT - BuyRight Notes storefront site

A static site, built by Claude, outside 01_WORKSPACE so Claude and Codex can work at the same time without two writers in one folder.

- Design brief: ../01_WORKSPACE/reports/STOREFRONT_DESIGN_BRIEF_2026-09-23.md
- Brand kit v1 (September 23, 2026): brand/index.html to view, brand/brand.css for tokens and components, brand/BRAND.md for the rules, logo files in brand/. Every storefront page imports brand/brand.css first.
- Storefront page v1 (September 23, 2026): index.html + storefront.css + storefront.js. Reads data/products.json, falls back to data/products.sample.json (example rows are labeled and never shown in production). Hero from ?p=PRODUCT-ID, sticky buy bar, category wheels (since September 24: three pictures always in view, arrows, swipe or arrow keys turn the wheel through the whole category; product pages show two wheels, their own category and Hot deals), tap-to-open detail sheet. Affiliate links stay off until site.affiliate_links_enabled is true in the data file; until then every button goes to the matching guide. Add ?preview to show example rows with real data.
- Build (September 23, 2026): `node build.mjs` generates index.html, one page per LIVE product at p/<product_id>/, the About / How we pick / Privacy / Contact pages from content/*.md, 404.html, manifest, robots.txt and sitemap.xml, with Open Graph tags, JSON-LD and the GA4 tag from site.config.json. `node build.mjs --sample` builds from the sample data. Templates live in templates/. To add a product, follow data/PRODUCT_TEMPLATE.json, then build.
- Generated files (do not hand-edit): index.html, p/, about/, how-we-pick/, privacy/, contact/, 404.html, manifest.webmanifest, robots.txt, sitemap.xml.
- Local preview: the launch config "storefront-preview" in 01_WORKSPACE/.claude/launch.json serves the whole Amazon-Affiliate-Engine folder on port 8765.
- data/products.json is written only by Codex's exporter (01_WORKSPACE/tools/export_storefront.mjs) from data/storefront_products.csv. Nobody edits it by hand.
- Nothing here is public until the owner creates the host account and the site is added to the Associates website list.
- Three sizes (September 24, 2026): phone (swipeable category bar), tablet from 720 px (every chip in view), desktop from 1080 px (categories in the header row, photo and notes side by side, each wheel's description beside it). Product pages open their notes with a facts grid (Size, Fits, Includes...) and end with an "All our picks" tile grid; the top item on a product page is the visitor's Pinterest pick, not a featured hero. Check every size with `node ../01_WORKSPACE/tools/storefront_mobile_check.mjs --devices se,ipad,ipadland,laptop,desktop` before pushing.

## Pages and structure (September 24, 2026)
- **Tokens:** every color, font, spacing and radius is in `brand/brand.css` (`:root` block). Change the look there; nothing else carries colors.
- **Templates:** `templates/store.html` (home and product pages), `templates/page.html` (text pages, guides, 404). Header and footer are shared partials in `templates/partials/`; edit once, every page follows.
- **Text pages:** `content/<slug>.md` (About, How we pick, Privacy, Terms, Contact).
- **Collections:** any folder under `content/` is a collection. `content/guides/<slug>.md` with front matter (`title`, `description`, `date`, `collection`, `cluster`, `source`) becomes `/guides/<slug>/`, gets listed at `/guides/`, in the sitemap, and the newest four appear in the Guides row on the home page. A blog is the same thing: `content/blog/<slug>.md` -> `/blog/`.
- **Products:** `data/products.json` from `01_WORKSPACE/tools/export_storefront.mjs`; never edited by hand.
- **Check before pushing:** `node 01_WORKSPACE/tools/storefront_mobile_check.mjs`.
