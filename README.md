# 03_STOREFRONT - BuyRight Notes storefront site

A static site, built by Claude, outside 01_WORKSPACE so Claude and Codex can work at the same time without two writers in one folder.

- Design brief: ../01_WORKSPACE/reports/STOREFRONT_DESIGN_BRIEF_2026-09-23.md
- Brand kit v1 (September 23, 2026): brand/index.html to view, brand/brand.css for tokens and components, brand/BRAND.md for the rules, logo files in brand/. Every storefront page imports brand/brand.css first.
- Storefront page v1 (September 23, 2026): index.html + storefront.css + storefront.js. Reads data/products.json, falls back to data/products.sample.json (example rows are labeled and never shown in production). Hero from ?p=PRODUCT-ID, sticky buy bar, shuffle reels, tap-to-open detail sheet. Affiliate links stay off until site.affiliate_links_enabled is true in the data file; until then every button goes to the matching guide. Add ?preview to show example rows with real data.
- Build (September 23, 2026): `node build.mjs` generates index.html, one page per LIVE product at p/<product_id>/, the About / How we pick / Privacy / Contact pages from content/*.md, 404.html, manifest, robots.txt and sitemap.xml, with Open Graph tags, JSON-LD and the GA4 tag from site.config.json. `node build.mjs --sample` builds from the sample data. Templates live in templates/. To add a product, follow data/PRODUCT_TEMPLATE.json, then build.
- Generated files (do not hand-edit): index.html, p/, about/, how-we-pick/, privacy/, contact/, 404.html, manifest.webmanifest, robots.txt, sitemap.xml.
- Local preview: the launch config "storefront-preview" in 01_WORKSPACE/.claude/launch.json serves the whole Amazon-Affiliate-Engine folder on port 8765.
- data/products.json is written only by Codex's exporter (01_WORKSPACE/tools/export_storefront.mjs) from data/storefront_products.csv. Nobody edits it by hand.
- Nothing here is public until the owner creates the host account and the site is added to the Associates website list.
