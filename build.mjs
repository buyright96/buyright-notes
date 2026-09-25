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
// A real build never falls back to the sample (Codex review 2026-09-24): a missing export is a failed build, not a preview.
if (useSample) dataFile = 'data/products.sample.json';
else if (!fs.existsSync(path.join(root, dataFile))) throw Error('data/products.json is missing: run 01_WORKSPACE/tools/export_storefront.mjs first, or pass --sample for a preview build');
const data = JSON.parse(rd(dataFile));
const site = Object.assign({}, data.site || {}, { blog_url: cfg.blog_url || data.site?.blog_url });
const base = (cfg.base_url || '').replace(/\/$/, '');
const abs = (p) => base ? `${base}/${p.replace(/^\//, '')}` : p;
const live = (data.products || []).filter(p => !p.example && p.status === 'LIVE');
// Same link policy as storefront.js buyHref: the tagged Amazon link only while site.affiliate_links_enabled is true,
// otherwise the guide (or the product's own page), so the raw HTML never carries a tagged link in a disabled state or before JS runs.
const buyUrl = (p) => p ? ((site.affiliate_links_enabled === true && p.amazon_url) ? p.amazon_url : (p.guide_url || abs(`p/${p.product_id}/`))) : '';
// Pinterest Save descriptions: the Pin title plus the disclosure, so a Pin saved from our page is disclosed like every Pin we publish.
const DISCLOSURE = 'We earn a commission if you buy through our links.';
const saveDescription = (pin) => `${pin.title} ${DISCLOSURE}`;
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
      <img src="${esc(rootPrefix + pin.image)}" alt="${esc(pin.alt)}" width="1000" height="1500" loading="lazy" decoding="async" data-pin-description="${esc(saveDescription(pin))}">
      <figcaption>How it looks at home</figcaption>
    </figure>` : '';
};

// ---------- store pages ----------
const storeTpl = rd('templates/store.html');
// Hero text and photo are pre-rendered so nothing moves when storefront.js fills the page (no layout shift under the Buy button).
const reelLabel = (id) => (data.reels || []).find(r => r.id === id)?.label || id;
// data-pin-media: the Pinterest Save button offers the tall 2:3 Pin image instead of the 4:5 card.
const heroMedia = (p, rootPrefix) => p && p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" fetchpriority="high" decoding="async"${pins[p.product_id] ? ` data-pin-media="${esc(abs(pins[p.product_id].image))}" data-pin-description="${esc(saveDescription(pins[p.product_id]))}"` : ''}>` : '';
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
// Everything a crawler needs is in the HTML itself: the category bar, every category's picks, and (on product pages)
// the "All our picks" tiles. storefront.js rebuilds the same things with the wheels; without it the plain links work.
// Same rules as storefront.js: a category exists when a LIVE product lists it; a product page shows its own category
// (if it has more than one pick, else the first non-hot category with more than one) and then Hot deals.
const categories = (data.reels || []).map(r => ({ ...r, items: buildable.filter(p => (p.reels || [p.category]).includes(r.id)) })).filter(r => r.items.length);
const pageCats = (hero, isHome) => {
  if (isHome) return categories;
  const own = categories.find(r => r.id === hero.category && r.items.length > 1) || categories.find(r => r.id !== 'hot_deals' && r.items.length > 1);
  return [own, categories.find(r => r.id === 'hot_deals')].filter((r, i, a) => r && a.indexOf(r) === i);
};
const catnav = (hero, isHome, rootPrefix) => {
  const here = new Set(pageCats(hero, isHome).map(c => c.id));
  return [`<a href="${isHome ? '#top' : rootPrefix + './'}" data-target="top"${isHome ? ' aria-current=""' : ''}>All picks</a>`,
    ...categories.map(c => `<a href="${here.has(c.id) ? '#' + c.id : rootPrefix + './#' + c.id}" data-target="${c.id}">${esc(c.label)}</a>`)].join('');
};
const staticShelves = (hero, isHome, rootPrefix) => pageCats(hero, isHome).map(c => `<section class="shelf static" id="${c.id}" aria-labelledby="shelf-${c.id}">
  <div class="shelf-head"><h2 class="h2" id="shelf-${c.id}">${esc(c.label)}</h2></div>
  <ul class="picks">${c.items.map(p => `<li><a href="${rootPrefix}p/${p.product_id}/"><span class="card-media">${p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" loading="lazy" decoding="async">` : ''}</span><b>${esc(p.title)}</b>${p.reason_to_buy ? `<span>${esc(p.reason_to_buy)}</span>` : ''}</a></li>`).join('')}</ul>
</section>`).join('\n');
const staticTiles = (hero, rootPrefix) => categories.map(c => { const pic = c.items.find(p => p.product_id !== hero.product_id) || c.items[0]; return `<a class="tile" href="${rootPrefix}./#${c.id}"${c.id === hero.category ? ' aria-current="true"' : ''}><span class="card-media">${pic.card_image ? `<img src="${esc(rootPrefix + pic.card_image)}" alt="${esc(pic.image_alt || '')}" loading="lazy" decoding="async">` : ''}</span><b>${esc(c.label)}</b><span>${c.items.length} ${c.items.length === 1 ? 'pick' : 'picks'}</span></a>`; }).join('');
const pageTpl = rd('templates/page.html');
// ---------- shared header and footer (templates/partials), so a nav change is one edit for every page ----------
const partials = { header: rd('templates/partials/header.html'), footer: rd('templates/partials/footer.html') };
// Site nav: the same two links on every page; `current` marks where the reader is. Add a page here and it appears everywhere.
const siteNav = (rootPrefix, current) => `    <nav class="sitenav" aria-label="Site"><a href="${rootPrefix || './'}"${current === 'shop' ? ' aria-current="page"' : ''}>Shop</a><a href="${rootPrefix}guides/"${current === 'guides' ? ' aria-current="page"' : ''}>Guides</a></nav>`;
const shopNav = () => '';
const frame = (html, { rootPrefix, nav, footerLine, current = '' }) => html
  .replace('{{HEADER}}', partials.header.replace('{{SITENAV}}', siteNav(rootPrefix, current)).replace('{{NAV}}', nav))
  .replace('{{FOOTER}}', partials.footer.replace('{{FOOTER_LINE}}', footerLine))
  .replaceAll('{{ROOT}}', rootPrefix);
// ---------- articles: content/<collection>/<slug>.md with front matter -> <collection>/<slug>/index.html ----------
function frontMatter(raw) {
  raw = raw.replace(/\r\n/g, '\n'); // files saved on Windows keep working
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const front = Object.fromEntries((fm ? fm[1] : '').split('\n').map(l => l.split(/:\s(.*)/)).filter(a => a[0]).map(([k, v]) => [k.trim(), (v || '').trim()]));
  return { front, body: fm ? fm[2] : raw };
}
const collections = {};
for (const coll of fs.existsSync(path.join(root, 'content')) ? fs.readdirSync(path.join(root, 'content')).filter(d => fs.statSync(path.join(root, 'content', d)).isDirectory()) : []) {
  collections[coll] = fs.readdirSync(path.join(root, 'content', coll)).filter(f => f.endsWith('.md')).map(f => {
    const { front, body } = frontMatter(rd(`content/${coll}/${f}`));
    return { slug: f.replace(/\.md$/, ''), coll, front, body };
  }).sort((a, b) => (b.front.date || '').localeCompare(a.front.date || '') || a.front.title.localeCompare(b.front.title));
}
const guides = collections.guides || [];

// Featured picks: the owner's list in site.config.json ("featured": [product ids]); unknown or retired ids are skipped.
const featuredRow = (rootPrefix) => {
  const picks = (cfg.featured || []).map(id => buildable.find(p => p.product_id === id)).filter(Boolean);
  if (!picks.length) return '';
  const label = id => (categories.find(c => c.id === id) || {}).label || '';
  return `    <section class="featured" aria-labelledby="featured-h">
      <div class="row-head"><h2 class="h2" id="featured-h">Featured picks</h2><span class="row-note">Chosen by us this week</span></div>
      <div class="tiles">${picks.map(p => `<a class="tile" href="${rootPrefix}p/${p.product_id}/"><span class="card-media">${p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" loading="lazy" decoding="async">` : ''}</span><b>${esc(p.title)}</b><span>${esc(label(p.category))}</span></a>`).join('')}</div>
    </section>`;
};
const FOOTER_LINE = "Prices and availability change. We link you to Amazon to see today's.";
// Home page row of guides: the newest four, as text tiles, with a link to the whole collection.
const guidesRow = (rootPrefix) => guides.length ? `    <section class="guides-row" aria-labelledby="guides-h">
      <div class="row-head"><h2 class="h2" id="guides-h">Guides</h2><a class="btn btn-ghost btn-sm" href="${rootPrefix}guides/">All guides</a></div>
      <div class="guide-tiles">${guides.slice(0, 4).map(g => `<a class="guide-tile" href="${rootPrefix}guides/${g.slug}/"><b>${esc(g.front.title)}</b><span>${esc(g.front.cluster || '')}</span></a>`).join('')}</div>
    </section>` : '';
function storePage({ rootPrefix, heroId, title, description, url, image, ld, heroBuyUrl = '#', heroGuideUrl = '#', hero }) {
  const isHome = !heroId;
  return frame(storeTpl, { rootPrefix, nav: '    <nav class="catnav" id="catnav" aria-label="Browse picks">{{CATNAV}}</nav>', footerLine: FOOTER_LINE, current: 'shop' })
    .replace('{{FEATURED}}', isHome ? featuredRow(rootPrefix) : '')
    .replace('<!--META-->', meta({ title, description, url, image, type: heroId ? 'article' : 'website', extra: ld ? jsonld(ld) : '' }))
    .replace('{{PIN_FIGURE}}', heroId ? pinFigure(hero, rootPrefix) : '')
    .replace('{{MORE_OPEN}}', heroId ? ' open' : '')
    .replace('{{HERO_DETAIL}}', hero ? renderDetail(hero.detail) : '')
    .replace('{{CATNAV}}', hero ? catnav(hero, isHome, rootPrefix) : '')
    .replace('{{SHELVES}}', hero ? staticShelves(hero, isHome, rootPrefix) : '')
    .replace('{{CATGRID_HIDDEN}}', isHome ? ' hidden' : '')
    .replace('{{CATGRID}}', hero && !isHome ? staticTiles(hero, rootPrefix) : '')
    .replace('{{DISCLOSURE}}', esc(site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.'))
    .replace('{{PREVIEW_NOTE}}', dataFile.endsWith('sample.json') ? '\n  <p class="preview-note" id="preview-note">Preview with sample products</p>\n' : '')
    .replace('{{HOME_INTRO}}', isHome ? `\n  <p class="intro">Research before you buy. Every pick here says who it is for, what to check first, and who should skip it.</p>\n` : '')
    .replace('<!--ANALYTICS-->', analytics)
    .replace('{{GUIDES_ROW}}', isHome ? guidesRow(rootPrefix) : '')
    .replace('{{HERO_ID}}', heroId || (hero ? hero.product_id : ''))
    .replace('{{BACK_HIDDEN}}', heroId ? '' : ' hidden')
    .replace('{{HERO_TITLE}}', esc(hero ? hero.title : title))
    .replace('{{HERO_WHY}}', hero && hero.reason_to_buy ? esc(`"${hero.reason_to_buy}"`) : '')
    .replace('{{HERO_CHIP}}', isHome ? 'Newest pick' : hero ? esc(reelLabel(hero.category)) : '')
    .replace('{{HERO_MEDIA}}', heroMedia(hero, rootPrefix))
    .replaceAll('{{HERO_BUY_URL}}', esc(heroBuyUrl || '#'))
    .replaceAll('{{HERO_GUIDE_URL}}', esc(heroGuideUrl || '#'));
}
const homeDesc = cfg.home_description || cfg.tagline || site.disclosure || '';
const homeTitle = cfg.home_title || cfg.name;
// Home features the newest pick (the last hero-eligible row), so it changes every time a product launches.
const homeHero = [...buildable].reverse().find(p => p.hero_eligible) || buildable[buildable.length - 1];
written.push(wr('index.html', storePage({ rootPrefix: '', heroId: '', title: homeTitle, description: homeDesc, url: base ? `${base}/` : '', heroBuyUrl: buyUrl(homeHero), heroGuideUrl: homeHero?.guide_url, hero: homeHero, ld: { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.name, itemListElement: buildable.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: abs(`p/${p.product_id}/`) })) } })));
for (const p of buildable) {
  const url = abs(`p/${p.product_id}/`);
  // The page title repeats the Pin title when there is one, so the Pin and its landing page say the same thing.
  const headline = pins[p.product_id]?.title || p.title;
  written.push(wr(`p/${p.product_id}/index.html`, storePage({ rootPrefix: '../../', heroId: p.product_id, title: `${headline} · ${cfg.name}`, description: p.reason_to_buy || homeDesc, url: base ? url : '', image: p.card_image, heroBuyUrl: buyUrl(p), heroGuideUrl: p.guide_url, hero: p, ld: articleLd(p, base ? url : undefined, headline) })));
}

// ---------- text pages (tiny markdown: headings, paragraphs, lists, links, emphasis, blockquote) ----------
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
  const { front, body } = frontMatter(raw);
  const url = abs(`${slug}/`);
  written.push(wr(`${slug}/index.html`, frame(pageTpl
    .replace('<!--META-->', meta({ title: `${front.title} · ${cfg.name}`, description: front.description || homeDesc, url: base ? url : '' }))
    .replace('<!--ANALYTICS-->', analytics)
    .replace('{{CONTENT}}', md(body)), { rootPrefix: '../', nav: '', footerLine: FOOTER_LINE })));
}

// ---------- article pages and their collection index ----------
const DISCLOSURE_LINE = site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.';
for (const [coll, items] of Object.entries(collections)) {
  for (const it of items) {
    const rootPrefix = '../../', url = abs(`${coll}/${it.slug}/`);
    const hasAmazon = /amazon\.com/.test(it.body);
    const byline = `<p class="byline">${it.front.cluster ? `<b>${esc(it.front.cluster)}</b>` : ''}${it.front.date ? `<span>${esc(new Date(it.front.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))}</span>` : ''}</p>`;
    const content = `<a class="backlink" href="../"><span aria-hidden="true">&larr;</span> All ${esc(coll)}</a>\n` + md(it.body).replace(/(<h1[^>]*>.*?<\/h1>)/, `$1\n${byline}${hasAmazon ? `\n<p class="disclosure">${esc(DISCLOSURE_LINE)}</p>` : ''}`);
    const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: it.front.title, description: it.front.description || '', datePublished: it.front.date || undefined, author: { '@type': 'Organization', name: cfg.name }, publisher: { '@type': 'Organization', name: cfg.name }, mainEntityOfPage: base ? url : undefined };
    written.push(wr(`${coll}/${it.slug}/index.html`, frame(pageTpl
      .replace('<!--META-->', meta({ title: `${it.front.title} · ${cfg.name}`, description: it.front.description || homeDesc, url: base ? url : '', type: 'article', image: it.front.image || (cfg.collection_share_images || {})[coll], extra: jsonld(ld) }))
      .replace('<!--ANALYTICS-->', analytics)
      .replace('{{CONTENT}}', content), { rootPrefix, nav: '', footerLine: FOOTER_LINE, current: coll })));
  }
  const label = coll[0].toUpperCase() + coll.slice(1);
  const groups = [...new Set(items.map(i => i.front.cluster || ''))];
  const list = groups.map(g => `${g ? `<h2 class="h2">${esc(g)}</h2>` : ''}<ul class="collection">${items.filter(i => (i.front.cluster || '') === g).map(i => `<li><a href="${i.slug}/">${esc(i.front.title)}</a><p>${esc(i.front.description || '')}</p>${i.front.date ? `<small>${esc(i.front.date)}</small>` : ''}</li>`).join('')}</ul>`).join('\n');
  written.push(wr(`${coll}/index.html`, frame(pageTpl
    .replace('<!--META-->', meta({ title: (cfg.collection_titles || {})[coll] || `${label} · ${cfg.name}`, description: (cfg.collection_descriptions || {})[coll] || `The long version behind our picks: who each is for, what to check, and who should skip it.`, url: base ? abs(`${coll}/`) : '', image: (cfg.collection_share_images || {})[coll] }))
    .replace('<!--ANALYTICS-->', analytics)
    .replace('{{CONTENT}}', `<h1 class="h1">${esc(label)}</h1><p>The long version behind our picks: what to measure, what fits what, and when to wait. Short notes live in the shop; the reasoning lives here.</p>\n${list}`), { rootPrefix: '../', nav: '', footerLine: FOOTER_LINE, current: coll })));
}

// ---------- 404, manifest, robots, sitemap ----------
written.push(wr('404.html', frame(pageTpl
  .replace('<!--META-->', meta({ title: `Not found · ${cfg.name}`, description: 'That page is not on the shelf.' }) + '\n<meta name="robots" content="noindex">')
  .replace('<!--ANALYTICS-->', analytics), { rootPrefix: '/', nav: '', footerLine: FOOTER_LINE })
  .replace('{{CONTENT}}', `<h1 class="h1">That page is not on the shelf.</h1><p>The product may have been retired. <a href="/">Back to the shop</a>.</p>`)));
written.push(wr('manifest.webmanifest', JSON.stringify({ name: cfg.name, short_name: 'BuyRight', start_url: './', display: 'standalone', background_color: cfg.theme_color, theme_color: cfg.theme_color, icons: [{ src: 'brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2)));
written.push(wr('robots.txt', `User-agent: *\nAllow: /\nDisallow: /data/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`));
const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: `${base}/`, lastmod: today }, ...buildable.map(p => ({ loc: `${base}/p/${p.product_id}/`, lastmod: p.last_offer_check })), ...['about', 'how-we-pick', 'privacy', 'terms', 'contact'].map(s => ({ loc: `${base}/${s}/` })), ...Object.entries(collections).flatMap(([c, items]) => [{ loc: `${base}/${c}/`, lastmod: items.map(i => i.front.date).filter(Boolean).sort().pop() }, ...items.map(i => ({ loc: `${base}/${c}/${i.slug}/`, lastmod: i.front.date }))])];
written.push(wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(u.lastmod || '') ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`));

console.log(JSON.stringify({ data: dataFile, base_url: base || '(not set)', products_built: buildable.length, live_products: live.length, files: written.length, affiliate_links_enabled: site.affiliate_links_enabled === true, warnings: [!base && 'base_url is empty: canonical, sitemap and share URLs are relative', !cfg.contact_email && 'contact_email is empty: Contact page shows a placeholder', !cfg.pinterest_domain_verify && 'pinterest_domain_verify is empty'].filter(Boolean) }, null, 2));
