// BuyRight Notes storefront build. No dependencies.
//   node build.mjs            -> builds from data/products.json (falls back to the sample with a warning)
//   node build.mjs --sample   -> builds from data/products.sample.json on purpose
// Writes: index.html, p/<product_id>/index.html, about/ how-we-pick/ privacy/ contact/ (index.html each),
//         sitemap.xml, robots.txt, 404.html, manifest.webmanifest.
// Never writes data/products.json (Codex's exporter owns it) and never touches brand/ or assets/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const rd = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const wr = (f, s) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); return f; };
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cfg = JSON.parse(rd('site.config.json'));
const useSample = process.argv.includes('--sample');
let dataFile = 'data/products.json';
if (useSample || !fs.existsSync(path.join(root, dataFile))) { dataFile = 'data/products.sample.json'; if (!useSample) console.warn('warning: data/products.json missing, building from the sample'); }
const data = JSON.parse(rd(dataFile));
const site = Object.assign({}, data.site || {}, { blog_url: cfg.blog_url || data.site?.blog_url });
const base = (cfg.base_url || '').replace(/\/$/, '');
const abs = (p) => base ? `${base}/${p.replace(/^\//, '')}` : p;
const live = (data.products || []).filter(p => !p.example && p.status === 'LIVE');
const buildable = dataFile.endsWith('sample.json') ? (data.products || []).filter(p => !p.example) : live;
const written = [];
// Generated product pages are rebuilt from scratch so retired products disappear.
fs.rmSync(path.join(root, 'p'), { recursive: true, force: true });

// ---------- shared head pieces ----------
function meta({ title, description, url, image, type = 'website', extra = '' }) {
  const img = image ? abs(image) : abs(cfg.default_share_image);
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    url ? `<link rel="canonical" href="${esc(url)}">` : '',
    `<meta name="theme-color" content="${cfg.theme_color || '#14100d'}">`,
    `<meta property="og:site_name" content="${esc(cfg.name)}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    url ? `<meta property="og:url" content="${esc(url)}">` : '',
    `<meta property="og:image" content="${esc(img)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(img)}">`,
    cfg.pinterest_domain_verify ? `<meta name="p:domain_verify" content="${esc(cfg.pinterest_domain_verify)}">` : '',
    cfg.google_site_verification ? `<meta name="google-site-verification" content="${esc(cfg.google_site_verification)}">` : '',
    cfg.bing_site_verification ? `<meta name="msvalidate.01" content="${esc(cfg.bing_site_verification)}">` : '',
    extra,
  ].filter(Boolean).join('\n');
}
// Internal mode (owner, 2026-09-24): opening any page once with ?internal=on marks that browser as ours (?internal=off undoes it).
// Our visits are then sent with traffic_type=internal, so GA4's Internal Traffic filter can drop or count them, and
// storefront.js gives our Buy buttons untagged Amazon links, so our clicks never reach the Associates report.
// Local previews (localhost) are always internal.
const analytics = cfg.ga4_measurement_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.ga4_measurement_id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());
(function(){var i=false;try{var q=new URLSearchParams(location.search).get('internal');if(q==='on')localStorage.setItem('br_internal','1');if(q==='off')localStorage.removeItem('br_internal');i=localStorage.getItem('br_internal')==='1';}catch(e){}
if(/^(localhost|127\\.|\\[::1\\])/.test(location.hostname))i=true;window.__INTERNAL=i;if(i)gtag('set',{traffic_type:'internal'});
gtag('config','${cfg.ga4_measurement_id}',i?{send_page_view:true,traffic_type:'internal'}:{send_page_view:true});})();</script>` : '<!-- analytics: no GA4 id in site.config.json -->';

function jsonld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`; }
// The exact Pin B image each product is promoted with (01_WORKSPACE/tools/export_pin_media.mjs), shown on its page so
// Pinterest's Pin-to-page match sees the same picture and words. Optional: pages build without it.
const pins = fs.existsSync(path.join(root, 'data/pins.json')) ? JSON.parse(rd('data/pins.json')) : {};
// Article, not Product: we cannot show prices, Pinterest product Rich Pins exclude affiliates, and product markup
// would override the article Rich Pin (01_WORKSPACE skill references/pinterest-seo.md).
const org = { '@type': 'Organization', name: cfg.name, url: base ? `${base}/` : undefined };
const articleLd = (p, url, headline) => ({ '@context': 'https://schema.org', '@type': 'Article', headline, description: p.reason_to_buy, image: [p.card_image, pins[p.product_id]?.image].filter(Boolean).map(abs), url, author: org, publisher: org });
const pinFigure = (p, rootPrefix) => {
  const pin = p && pins[p.product_id];
  return pin ? `    <figure class="inuse" id="inuse">
      <img src="${esc(rootPrefix + pin.image)}" alt="${esc(pin.alt)}" width="1000" height="1500" loading="lazy" decoding="async" data-pin-description="${esc(pin.title)}">
      <figcaption>How it looks at home</figcaption>
    </figure>` : '';
};

// ---------- store pages ----------
const storeTpl = rd('templates/store.html');
// Hero text and photo are pre-rendered so nothing moves when storefront.js fills the page (no layout shift under the Buy button).
const reelLabel = (id) => (data.reels || []).find(r => r.id === id)?.label || id;
// data-pin-media: the Pinterest Save button offers the tall 2:3 Pin image instead of the 4:5 card.
const heroMedia = (p, rootPrefix) => p && p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" fetchpriority="high" decoding="async"${pins[p.product_id] ? ` data-pin-media="${esc(abs(pins[p.product_id].image))}" data-pin-description="${esc(pins[p.product_id].title)}"` : ''}>` : '';
// "Why we picked it", pre-rendered so a product page shows its notes open with nothing moving when storefront.js runs.
// Mirrors fillDetail in storefront.js: reason lines, "+ " highlights, "Label: value" facts, and the "Skip it if" line.
const SPEC_LABELS = new Set(['Size', 'Weight', 'Fits', 'Works with', 'Capacity', 'Includes', 'Tank', 'Power', 'Battery', 'Screen', 'Runtime', 'Care', 'Hopper', 'Pitcher', 'Bowl', 'Connects', 'Cord', 'Hose', 'Burrs', 'Colors', 'Formula', 'Skin', 'Brews', 'Speeds', 'Pressure', 'Cleanup', 'Oven', 'Sounds', 'Storage']);
function renderDetail(text) {
  const out = []; let ul = false, dl = false;
  const close = () => { if (ul) out.push('</ul>'); if (dl) out.push('</dl>'); ul = dl = false; };
  for (const line of String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean)) {
    const spec = line.match(/^([A-Z][A-Za-z ]{1,12}):\s+(.+)$/);
    if (spec && SPEC_LABELS.has(spec[1])) { if (!dl) { close(); out.push('<dl class="specs">'); dl = true; } out.push(`<dt>${esc(spec[1])}</dt><dd>${esc(spec[2])}</dd>`); continue; }
    if (line.startsWith('+ ')) { if (!ul) { close(); out.push('<ul class="highlights">'); ul = true; } out.push(`<li>${esc(line.slice(2))}</li>`); continue; }
    close(); out.push(`<p class="${/^skip it if/i.test(line) ? 'skip' : 'reason'}">${esc(line)}</p>`);
  }
  close(); return out.join('');
}
function storePage({ rootPrefix, heroId, title, description, url, image, ld, heroBuyUrl = '#', heroGuideUrl = '#', hero }) {
  return storeTpl
    .replace('<!--META-->', meta({ title, description, url, image, type: heroId ? 'article' : 'website', extra: ld ? jsonld(ld) : '' }))
    .replace('{{PIN_FIGURE}}', heroId ? pinFigure(hero, rootPrefix) : '')
    .replace('{{MORE_OPEN}}', heroId ? ' open' : '')
    .replace('{{HERO_DETAIL}}', hero ? renderDetail(hero.detail) : '')
    .replace('<!--ANALYTICS-->', analytics)
    .replaceAll('{{ROOT}}', rootPrefix)
    .replaceAll('{{BLOG_URL}}', esc(site.blog_url || '#'))
    .replace('{{HERO_ID}}', heroId || (hero ? hero.product_id : ''))
    .replace('{{BACK_HIDDEN}}', heroId ? '' : ' hidden')
    .replace('{{HERO_TITLE}}', esc(hero ? hero.title : title))
    .replace('{{HERO_WHY}}', hero && hero.reason_to_buy ? esc(`"${hero.reason_to_buy}"`) : '')
    .replace('{{HERO_CHIP}}', hero ? esc(reelLabel(hero.category)) : '')
    .replace('{{HERO_MEDIA}}', heroMedia(hero, rootPrefix))
    .replaceAll('{{HERO_BUY_URL}}', esc(heroBuyUrl || '#'))
    .replaceAll('{{HERO_GUIDE_URL}}', esc(heroGuideUrl || '#'));
}
const homeDesc = cfg.tagline || site.disclosure || '';
// Home features the newest pick (the last hero-eligible row), so it changes every time a product launches.
const homeHero = [...buildable].reverse().find(p => p.hero_eligible) || buildable[buildable.length - 1];
written.push(wr('index.html', storePage({ rootPrefix: '', heroId: '', title: cfg.name, description: homeDesc, url: base ? `${base}/` : '', heroBuyUrl: homeHero?.amazon_url, heroGuideUrl: homeHero?.guide_url, hero: homeHero, ld: { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.name, itemListElement: buildable.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: abs(`p/${p.product_id}/`) })) } })));
for (const p of buildable) {
  const url = abs(`p/${p.product_id}/`);
  // The page title repeats the Pin title when there is one, so the Pin and its landing page say the same thing.
  const headline = pins[p.product_id]?.title || p.title;
  written.push(wr(`p/${p.product_id}/index.html`, storePage({ rootPrefix: '../../', heroId: p.product_id, title: `${headline} · ${cfg.name}`, description: p.reason_to_buy || homeDesc, url: base ? url : '', image: p.card_image, heroBuyUrl: p.amazon_url, heroGuideUrl: p.guide_url, hero: p, ld: articleLd(p, base ? url : undefined, headline) })));
}

// ---------- text pages (tiny markdown: headings, paragraphs, lists, links, emphasis, blockquote) ----------
const pageTpl = rd('templates/page.html');
function md(src) {
  const inline = (s) => esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3}) (.*)/))) { flush(); out.push(`<h${m[1].length}${m[1].length === 1 ? ' class="h1"' : m[1].length === 2 ? ' class="h2"' : ' class="h3"'}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^> (.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^\*[^*]+\*$/.test(line)) { flush(); out.push(`<p class="updated">${inline(line.slice(1, -1))}</p>`); }
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush(); return out.join('\n');
}
const contactBlock = cfg.contact_email
  ? `**Email:** [${cfg.contact_email}](mailto:${cfg.contact_email})`
  : `> A public contact address is being set up. Until then, use the contact form on [the guides site](${site.blog_url || '#'}).`;
for (const slug of ['about', 'how-we-pick', 'privacy', 'terms', 'contact']) {
  const raw = rd(`content/${slug}.md`).replace('{{CONTACT_BLOCK}}', contactBlock);
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front = Object.fromEntries((fm ? fm[1] : '').split('\n').map(l => l.split(/:\s(.*)/)).filter(a => a[0]).map(([k, v]) => [k.trim(), (v || '').trim()]));
  const body = fm ? fm[2] : raw;
  const url = abs(`${slug}/`);
  written.push(wr(`${slug}/index.html`, pageTpl
    .replace('<!--META-->', meta({ title: `${front.title} · ${cfg.name}`, description: front.description || homeDesc, url: base ? url : '' }))
    .replace('<!--ANALYTICS-->', analytics)
    .replaceAll('{{ROOT}}', '../')
    .replaceAll('{{BLOG_URL}}', esc(site.blog_url || '#'))
    .replace('{{CONTENT}}', md(body))));
}

// ---------- 404, manifest, robots, sitemap ----------
written.push(wr('404.html', pageTpl
  .replace('<!--META-->', meta({ title: `Not found · ${cfg.name}`, description: 'That page is not on the shelf.' }) + '\n<meta name="robots" content="noindex">')
  .replace('<!--ANALYTICS-->', analytics)
  .replaceAll('{{ROOT}}', '/')
  .replaceAll('{{BLOG_URL}}', esc(site.blog_url || '#'))
  .replace('{{CONTENT}}', `<h1 class="h1">That page is not on the shelf.</h1><p>The product may have been retired. <a href="/">Back to the shop</a>.</p>`)));
written.push(wr('manifest.webmanifest', JSON.stringify({ name: cfg.name, short_name: 'BuyRight', start_url: './', display: 'standalone', background_color: cfg.theme_color, theme_color: cfg.theme_color, icons: [{ src: 'brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2)));
written.push(wr('robots.txt', `User-agent: *\nAllow: /\nDisallow: /data/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`));
const urls = [`${base}/`, ...buildable.map(p => `${base}/p/${p.product_id}/`), ...['about', 'how-we-pick', 'privacy', 'terms', 'contact'].map(s => `${base}/${s}/`)];
written.push(wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u)}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>`).join('\n')}\n</urlset>\n`));

console.log(JSON.stringify({ data: dataFile, base_url: base || '(not set)', products_built: buildable.length, live_products: live.length, files: written.length, affiliate_links_enabled: site.affiliate_links_enabled === true, warnings: [!base && 'base_url is empty: canonical, sitemap and share URLs are relative', !cfg.contact_email && 'contact_email is empty: Contact page shows a placeholder', !cfg.pinterest_domain_verify && 'pinterest_domain_verify is empty'].filter(Boolean) }, null, 2));
