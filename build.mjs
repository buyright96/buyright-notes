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
const analytics = cfg.ga4_measurement_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.ga4_measurement_id}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${cfg.ga4_measurement_id}',{send_page_view:true});</script>` : '<!-- analytics: no GA4 id in site.config.json -->';

function jsonld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`; }
const productLd = (p, url) => ({ '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.reason_to_buy, image: p.card_image ? [abs(p.card_image)] : undefined, url, sku: p.asin || undefined });

// ---------- store pages ----------
const storeTpl = rd('templates/store.html');
function storePage({ rootPrefix, heroId, title, description, url, image, ld, heroBuyUrl = '#', heroGuideUrl = '#' }) {
  return storeTpl
    .replace('<!--META-->', meta({ title, description, url, image, type: heroId ? 'product' : 'website', extra: ld ? jsonld(ld) : '' }))
    .replace('<!--ANALYTICS-->', analytics)
    .replaceAll('{{ROOT}}', rootPrefix)
    .replaceAll('{{BLOG_URL}}', esc(site.blog_url || '#'))
    .replace('{{HERO_ID}}', heroId || '')
    .replace('{{HERO_TITLE}}', esc(title))
    .replace('{{HERO_WHY}}', '')
    .replaceAll('{{HERO_BUY_URL}}', esc(heroBuyUrl || '#'))
    .replaceAll('{{HERO_GUIDE_URL}}', esc(heroGuideUrl || '#'));
}
const homeDesc = cfg.tagline || site.disclosure || '';
const homeHero = buildable.find(p => p.hero_eligible) || buildable[0];
written.push(wr('index.html', storePage({ rootPrefix: '', heroId: '', title: cfg.name, description: homeDesc, url: base ? `${base}/` : '', heroBuyUrl: homeHero?.amazon_url, heroGuideUrl: homeHero?.guide_url, ld: { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.name, itemListElement: buildable.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: abs(`p/${p.product_id}/`) })) } })));
for (const p of buildable) {
  const url = abs(`p/${p.product_id}/`);
  written.push(wr(`p/${p.product_id}/index.html`, storePage({ rootPrefix: '../../', heroId: p.product_id, title: `${p.title} · ${cfg.name}`, description: p.reason_to_buy || homeDesc, url: base ? url : '', image: p.card_image, heroBuyUrl: p.amazon_url, heroGuideUrl: p.guide_url, ld: productLd(p, base ? url : undefined) })));
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
