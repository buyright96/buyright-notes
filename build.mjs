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
const byId = Object.fromEntries(buildable.map(p => [p.product_id, p])); // product records by id (kits, funnel tokens)
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
    `<meta name="theme-color" content="${cfg.theme_color || '#171117'}">`,
    // Home-screen web app on iPhone: the page extends under the status bar and the header's safe-area padding covers it
    // (owner, Sept 27: the clock/signal/battery strip showed the page background).
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
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
// Internal browsers do not load GA4 or send events. This does not depend on the account's filter being Active.
// Every template also removes Amazon affiliate tags in internal mode; product-page JS keeps dynamic links plain.
// Local previews (localhost) are always internal.
const analytics = `<script data-br-analytics>
(function(){var q=new URLSearchParams(location.search).get('internal'),i=q==='on';
try{if(q==='on')localStorage.setItem('br_internal','1');if(q==='off')localStorage.removeItem('br_internal');if(q!=='on'&&q!=='off')i=localStorage.getItem('br_internal')==='1';}catch(e){}
if(/^(localhost|127\\.|\\[::1\\])/.test(location.hostname))i=true;window.__INTERNAL=i;
window.dataLayer=window.dataLayer||[];window.gtag=i?function(){}:function(){window.dataLayer.push(arguments);};
var id=${JSON.stringify(cfg.ga4_measurement_id || '')};
if(!i&&id){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);document.head.appendChild(s);gtag('js',new Date());gtag('config',id,{send_page_view:true});}
if(i)document.addEventListener('DOMContentLoaded',function(){
document.querySelectorAll('a[href]').forEach(function(a){try{var u=new URL(a.href);if(u.protocol==='https:'&&(u.hostname==='amazon.com'||u.hostname==='www.amazon.com')){u.searchParams.delete('tag');a.href=u.href;}}catch(e){}});
if(!document.querySelector('.internal-chip')){var chip=document.createElement('a'),off=new URL(location.href);off.searchParams.set('internal','off');chip.className='internal-chip';chip.href=off.href;chip.textContent='Internal testing';chip.title='Site tracking is off in this browser and Amazon affiliate tags are removed. Tap to turn off.';document.querySelector('.top .spacer')?.after(chip);}
});})();</script>`;

function jsonld(obj) { return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`; }
// The exact Pin B image each product is promoted with (01_WORKSPACE/tools/export_pin_media.mjs), shown on its page so
// Pinterest's Pin-to-page match sees the same picture and words. Optional: pages build without it.
const pins = fs.existsSync(path.join(root, 'data/pins.json')) ? JSON.parse(rd('data/pins.json')) : {};
// Article, not Product: we cannot show prices, Pinterest product Rich Pins exclude affiliates, and product markup
// would override the article Rich Pin (01_WORKSPACE skill references/pinterest-seo.md).
const org = { '@type': 'Organization', name: cfg.name, url: base ? `${base}/` : undefined, logo: { '@type': 'ImageObject', url: abs('brand/favicon.svg') } };
const crumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })) });
const articleLd = (p, url, headline) => [{ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, alternativeHeadline: headline !== p.title ? headline : undefined, description: p.reason_to_buy, image: [p.card_image, pins[p.product_id]?.image].filter(Boolean).map(abs), url, mainEntityOfPage: url, datePublished: p.last_offer_check || undefined, dateModified: p.last_offer_check || undefined, author: org, publisher: org, about: { '@type': 'Product', name: p.title, image: p.card_image ? abs(p.card_image) : undefined, sku: p.asin || undefined, brand: p.brand ? { '@type': 'Brand', name: p.brand } : undefined } }, crumbs([[cfg.name, base ? `${base}/` : undefined], ...(p.guide_url ? [['Guide', p.guide_url]] : []), [p.title, url]])];
const pinFigure = (p, rootPrefix) => {
  const pin = p && pins[p.product_id];
  return pin && !pin.same_as_card ? `    <figure class="inuse" id="inuse">
      <img src="${esc(rootPrefix + pin.image)}" alt="${esc(pin.alt)}" width="1000" height="1500" loading="lazy" decoding="async" data-pin-description="${esc(saveDescription(pin))}">
      <figcaption>How it looks at home</figcaption>
    </figure>` : '';
};

// ---------- store pages ----------
const storeTpl = rd('templates/store.html');
// Hero text and photo are pre-rendered so nothing moves when storefront.js fills the page (no layout shift under the Buy button).
const reelLabel = (id) => (data.reels || []).find(r => r.id === id)?.label || id;
// data-pin-media: the Pinterest Save button offers the tall 2:3 Pin image instead of the 4:5 card.
const heroMedia = (p, rootPrefix) => p && p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" width="1024" height="1280" fetchpriority="high" decoding="async"${pins[p.product_id] ? ` data-pin-media="${esc(abs(pins[p.product_id].image))}" data-pin-description="${esc(saveDescription(pins[p.product_id]))}"` : ''}>` : '';
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
  // Second wheel: the other picks from this product's guide (topical links beat a repeated deals shelf); Hot deals only when there are none.
  const sib = hero.guide_url ? buildable.filter(p => p.guide_url === hero.guide_url && p.product_id !== hero.product_id) : [];
  const second = sib.length ? { id: 'same_guide', label: 'From the same guide', items: sib } : categories.find(r => r.id === 'hot_deals');
  return [own, second].filter((r, i, a) => r && a.indexOf(r) === i);
};
const catnav = (hero, isHome, rootPrefix) => {
  const here = new Set(pageCats(hero, isHome).map(c => c.id));
  return [`<a href="${isHome ? '#top' : rootPrefix + './'}" data-target="top"${isHome ? ' aria-current=""' : ''}>All picks</a>`,
    ...categories.map(c => `<a href="${here.has(c.id) ? '#' + c.id : rootPrefix + './#' + c.id}" data-target="${c.id}">${esc(c.label)}</a>`)].join('');
};
const staticShelves = (hero, isHome, rootPrefix) => pageCats(hero, isHome).map(c => `<section class="shelf static" id="${c.id}" aria-labelledby="shelf-${c.id}">
  <div class="shelf-head"><h2 class="h2" id="shelf-${c.id}">${esc(c.label)}</h2></div>
  <ul class="picks">${c.items.map(p => `<li><a href="${rootPrefix}p/${p.product_id}/"><span class="card-media">${p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" width="1024" height="1280" loading="lazy" decoding="async">` : ''}</span><b>${esc(p.title)}</b>${p.reason_to_buy ? `<span>${esc(p.reason_to_buy)}</span>` : ''}</a></li>`).join('')}</ul>
</section>`).join('\n');
const staticTiles = (hero, rootPrefix) => categories.map(c => { const pic = c.items.find(p => p.product_id !== hero.product_id) || c.items[0]; return `<a class="tile" href="${rootPrefix}./#${c.id}"${c.id === hero.category ? ' aria-current="true"' : ''}><span class="card-media">${pic.card_image ? `<img src="${esc(rootPrefix + pic.card_image)}" alt="${esc(pic.image_alt || '')}" width="1024" height="1280" loading="lazy" decoding="async">` : ''}</span><b>${esc(c.label)}</b><span>${c.items.length} ${c.items.length === 1 ? 'pick' : 'picks'}</span></a>`; }).join('');
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
  }).sort((a, b) => (b.front.date || '').localeCompare(a.front.date || '') || (Number(a.front.home_rank) || 99) - (Number(b.front.home_rank) || 99) || a.front.title.localeCompare(b.front.title)); // same-day guides: home_rank (front matter) decides the home row
}
const guides = collections.guides || [];

// Featured picks: the owner's list in site.config.json ("featured": [product ids]); unknown or retired ids are skipped.
const featuredRow = (rootPrefix) => {
  const picks = (cfg.featured || []).map(id => buildable.find(p => p.product_id === id)).filter(Boolean);
  if (!picks.length) return '';
  const label = id => (categories.find(c => c.id === id) || {}).label || '';
  return `    <section class="featured" aria-labelledby="featured-h">
      <div class="row-head"><h2 class="h2" id="featured-h">Featured picks</h2><span class="row-note">Chosen by us this week</span></div>
      <div class="tiles">${picks.map(p => `<a class="tile" href="${rootPrefix}p/${p.product_id}/"><span class="card-media">${p.card_image ? `<img src="${esc(rootPrefix + p.card_image)}" alt="${esc(p.image_alt || '')}" width="1024" height="1280" loading="lazy" decoding="async">` : ''}</span><b>${esc(p.title)}</b><span>${esc(label(p.category))}</span></a>`).join('')}</div>
    </section>`;
};
const FOOTER_LINE = "Prices and availability change. We link you to Amazon to see today's.";
// Home page row of guides: the newest four, as text tiles, with a link to the whole collection.
const guidesRow = (rootPrefix) => guides.filter(g => !g.front.merged_into).length ? `    <section class="guides-row" aria-labelledby="guides-h">
      <div class="row-head"><h2 class="h2" id="guides-h">Guides</h2><a class="btn btn-ghost btn-sm" href="${rootPrefix}guides/">All guides</a></div>
      <div class="guide-tiles">${guides.filter(g => !g.front.merged_into).slice(0, 6).map(g => `<a class="guide-tile" href="${rootPrefix}guides/${g.slug}/"><b>${esc(g.front.title)}</b><span>${esc(g.front.cluster || '')}</span></a>`).join('')}</div>
    </section>` : '';
function storePage({ rootPrefix, heroId, title, description, url, image, ld, heroBuyUrl = '#', heroGuideUrl = '#', hero }) {
  const isHome = !heroId;
  return frame(storeTpl, { rootPrefix, nav: '    <nav class="catnav" id="catnav" aria-label="Browse picks">{{CATNAV}}</nav>', footerLine: FOOTER_LINE, current: 'shop' })
    .replace('{{FEATURED}}', isHome ? featuredRow(rootPrefix) : '')
    .replace('<!--META-->', meta({ title, description, url, image, type: heroId ? 'article' : 'website', extra: ld ? jsonld(ld) : '' }))
    .replace('{{PIN_FIGURE}}', heroId ? pinFigure(hero, rootPrefix) : '')
    .replace('{{MORE_OPEN}}', heroId ? ' open' : '')
    .replace('{{HERO_DETAIL}}', hero ? renderDetail(hero.detail) : '')
    .replace('{{HERO_KIT}}', heroId && hero && Array.isArray(hero.kit) && hero.kit.some(k => byId[k.product_id]) ? `<div class="kit"><h3 class="h3">Goes with</h3><ul>${hero.kit.filter(k => byId[k.product_id]).map(k => `<li><a href="../../p/${k.product_id}/">${esc(byId[k.product_id].title)}</a>${k.why ? `: ${esc(k.why)}` : ''}</li>`).join('')}</ul></div>` : '')
    .replace('{{HERO_CHECKS}}', heroId && hero && hero.page_notes ? `<div class="checks"><h3 class="h3">Before you buy</h3><ul>${hero.page_notes.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul>${hero.page_notes.fit ? `<p class="fitline"><b>Fits:</b> ${esc(hero.page_notes.fit)}</p>` : ''}${hero.page_notes.not_fit ? `<p class="fitline"><b>Not for:</b> ${esc(hero.page_notes.not_fit)}</p>` : ''}</div>` : '')
    .replace('{{CATNAV}}', hero ? catnav(hero, isHome, rootPrefix) : '')
    .replace('{{SHELVES}}', hero ? staticShelves(hero, isHome, rootPrefix) : '')
    .replace('{{CATGRID_HIDDEN}}', isHome ? ' hidden' : '')
    .replace('{{CATGRID}}', hero && !isHome ? staticTiles(hero, rootPrefix) : '')
    .replace('{{DISCLOSURE}}', esc(site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.'))
    .replace('{{PREVIEW_NOTE}}', dataFile.endsWith('sample.json') ? '\n  <p class="preview-note" id="preview-note">Preview with sample products</p>\n' : '')
    .replace('{{HOME_INTRO}}', isHome ? `\n  <h1 class="intro">Research before you buy. Every pick here says who it is for, what to check first, and who should skip it.</h1>\n` : '')
    .replaceAll('{{HERO_TAG}}', isHome ? 'h2' : 'h1')
    .replace('{{GUIDE_LINE_HIDDEN}}', heroGuideUrl && heroGuideUrl !== '#' ? '' : ' hidden')
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
written.push(wr('index.html', storePage({ rootPrefix: '', heroId: '', title: homeTitle, description: homeDesc, url: base ? `${base}/` : '', image: homeHero?.card_image, heroBuyUrl: buyUrl(homeHero), heroGuideUrl: homeHero?.guide_url, hero: homeHero, ld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: cfg.name, url: base ? `${base}/` : undefined, description: homeDesc, publisher: org }, { '@context': 'https://schema.org', ...org, sameAs: [site.blog_url].filter(Boolean), email: cfg.contact_email || undefined }, { '@context': 'https://schema.org', '@type': 'ItemList', name: cfg.name, itemListElement: buildable.map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: p.title, url: abs(`p/${p.product_id}/`) })) } ] })));
for (const p of buildable) {
  const url = abs(`p/${p.product_id}/`);
  // The page title repeats the Pin title when there is one, so the Pin and its landing page say the same thing.
  const headline = pins[p.product_id]?.title || p.title;
  written.push(wr(`p/${p.product_id}/index.html`, storePage({ rootPrefix: '../../', heroId: p.product_id, title: `${p.title} · ${cfg.name}`, description: p.reason_to_buy || homeDesc, url: base ? url : '', image: p.card_image, heroBuyUrl: buyUrl(p), heroGuideUrl: p.guide_url, hero: p, ld: articleLd(p, base ? url : undefined, headline) })));
}

// ---------- text pages (tiny markdown: headings, paragraphs, lists, links, emphasis, blockquote) ----------
function md(src) {
  const inline = (s) => esc(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const out = []; let list = null, fold = false;
  const flush = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeFold = () => { if (fold) { out.push('</details>'); fold = false; } };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    let m;
    // "## Title {fold}": a closed section the reader opens on tap. Everything to the next H1/H2 lives inside it, so the
    // words stay in the HTML for search while the page reads short (owner, Sept 27: one question, one kit, one screen).
    if ((m = line.match(/^## (.*) \{fold\}$/))) { flush(); closeFold(); const id = m[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); out.push(`<details class="fold" id="${id}"><summary><h2 class="h2">${inline(m[1])}</h2></summary>`); fold = true; continue; }
    if (/^#{1,2} /.test(line)) { flush(); closeFold(); }
    if ((m = line.match(/^(#{1,3}) (.*)/))) { flush(); const id = m[1].length > 1 ? ` id="${m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}"` : ''; out.push(`<h${m[1].length}${m[1].length === 1 ? ' class="h1"' : m[1].length === 2 ? ' class="h2"' : ' class="h3"'}${id}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^- (.*)/))) { if (list !== 'ul') { flush(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^\d+\. (.*)/))) { if (list !== 'ol') { flush(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = line.match(/^> (.*)/))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^\*[^*]+\*$/.test(line)) { flush(); out.push(`<p class="updated">${inline(line.slice(1, -1))}</p>`); }
    else if (/^(\[[^\]]+\]\(#[a-z0-9-]+\)(\s*·\s*)?)+$/.test(line)) { flush(); out.push(`<nav class="jumps" aria-label="On this page">${[...line.matchAll(/\[([^\]]+)\]\((#[a-z0-9-]+)\)/g)].map(m => `<a href="${m[2]}">${esc(m[1])}</a>`).join('')}</nav>`); }
    else { flush(); out.push(`<p>${inline(line)}</p>`); }
  }
  flush(); closeFold(); return out.join('\n');
}
const contactBlock = cfg.contact_email
  ? `**Email:** [${cfg.contact_email}](mailto:${cfg.contact_email})`
  : `> A public contact address is being set up. Until then, use the contact form on [the guides site](${site.blog_url || '#'}).`;
// Tools that a markdown page can drop in by token, on their own line; the partial replaces the paragraph the renderer wraps it in.
const PF = rd('templates/partials/portafilter-tool.html').trim();
// The fit funnel (guides): three taps, one pick. {{IMG|ALT|TITLE|ASIN|BUY|NOTE|CHECKS:ID}} tokens pull from the product record,
// so a fact lives in one place. Buy links are the tagged Amazon URL (plain when affiliate links are off); the partial's script
// swaps them for plain links in internal mode.
const FF = rd('templates/partials/fit-funnel.html').trim().replace(/\{\{(IMG|ALT|TITLE|ASIN|BUY|NOTE|CHECKS):([A-Z0-9-]+)\}\}/g, (_, k, id) => {
  const p = byId[id]; if (!p) throw Error(`fit funnel: unknown product ${id}`);
  if (k === 'IMG') return '../../' + p.card_image; if (k === 'ALT') return esc(p.image_alt || p.title); if (k === 'TITLE') return esc(p.title);
  if (k === 'ASIN') return p.asin || ''; if (k === 'NOTE') return `../../p/${p.product_id}/`;
  if (k === 'BUY') return (site.affiliate_links_enabled === true && p.amazon_url) ? p.amazon_url : (p.asin ? `https://www.amazon.com/dp/${p.asin}` : '#');
  return (p.page_notes?.checks || []).map(c => `<li>${esc(c)}</li>`).join('');
});
// Deals list (guides): the exported deals lane, one card each. A deal in our catalog links to our note; any other links to the
// tagged Amazon page (plain when affiliate links are off). An empty lane renders one honest line, so the page can be live
// before the first deal clears the 24-hour check.
const DL = (() => {
  const deals = Array.isArray(data.deals) ? data.deals : [];
  if (!deals.length) return '<div class="deals deals-empty"><p><b>Nothing has cleared yet.</b> A deal lands here only after the offer has held for a full day and the seller checks out. Check back the morning of the sale, or start with <a href="../../">the picks</a>, which say who each one is for.</p></div>';
  return `<ul class="deals">${deals.map(d => { const p = d.product_id && byId[d.product_id]; const href = p ? `../../p/${p.product_id}/` : d.asin ? (site.affiliate_links_enabled === true ? `https://www.amazon.com/dp/${d.asin}?tag=${d.tracking_id || site.tracking_id}` : `https://www.amazon.com/dp/${d.asin}`) : '#'; const alts = [d.replacement_1, d.replacement_2].filter(Boolean); return `<li class="deal"><h3 class="h3">${esc(d.product)}</h3><p>${esc(d.buyer_fit)}</p>${alts.length ? `<p class="deal-alt"><b>If it sells out:</b> ${esc(alts.join(' or '))}</p>` : ''}<p class="deal-cta">${p ? `<a class="btn btn-primary" href="${href}">Read our note</a>` : `<a class="btn btn-primary" href="${esc(href)}" rel="sponsored noopener" target="_blank" data-asin="${esc(d.asin)}">Check today's offer on Amazon</a>`}<span class="deal-verified">Checked ${esc(d.last_verified)}</span></p></li>`; }).join('')}</ul>`;
})();
const TOOLS = { '{{DEAL_LIST}}': DL, '{{PORTAFILTER_TOOL}}': PF, '{{PORTAFILTER_TOOL_HERO}}': PF.replace('class="pf-tool"', 'class="pf-tool pf-hero"'), '{{FIT_FUNNEL}}': FF };
// Static Amazon button for a markdown page: {{BUY:ID|Label}} on its own line, next to the specific recommendation (Codex pack,
// Sept 30: a legacy route should reach Amazon from the matched guide text, not only through a product page). Same link rule
// as the finder (tagged URL when affiliate links are on, plain otherwise); the internal-mode bootstrap strips the tag for us.
const buyButton = (id, label) => {
  const p = byId[id]; if (!p) throw Error(`buy button: unknown product ${id}`);
  const href = (site.affiliate_links_enabled === true && p.amazon_url) ? p.amazon_url : (p.asin ? `https://www.amazon.com/dp/${p.asin}` : '#');
  return `<p class="deal-cta"><a class="btn btn-primary" href="${esc(href)}" rel="sponsored noopener" target="_blank" data-asin="${esc(p.asin || '')}" data-product-id="${esc(p.product_id)}">${label}</a></p>`;
};
const tools = (html) => Object.entries(TOOLS).reduce((h, [tok, part]) => h.split(`<p>${tok}</p>`).join(part), html)
  .replace(/<p>\{\{BUY:([A-Z0-9-]+)\|([^}<]+)\}\}<\/p>/g, (_, id, label) => buyButton(id, label));
const TEXT_PAGES = ['home-espresso', 'portafilter-size-finder', 'about', 'how-we-pick', 'privacy', 'terms', 'contact'];
const textFront = {}; // slug -> front matter, for the sitemap (a text page with merged_into is a pointer: canonical elsewhere, noindex, off the sitemap)
for (const slug of TEXT_PAGES) {
  const raw = rd(`content/${slug}.md`).replace('{{CONTACT_BLOCK}}', contactBlock);
  const { front, body } = frontMatter(raw); textFront[slug] = front;
  const url = front.merged_into ? abs(front.merged_into) : abs(`${slug}/`);
  written.push(wr(`${slug}/index.html`, frame(pageTpl
    .replace('<!--META-->', meta({ title: `${front.title} · ${cfg.name}`, description: front.description || homeDesc, url: base ? url : '', image: front.image || undefined }) + (front.merged_into ? '\n<meta name="robots" content="noindex,follow">' : ''))
    .replace('<!--ANALYTICS-->', analytics)
    .replace('{{CONTENT}}', tools(md(body))), { rootPrefix: '../', nav: '', footerLine: FOOTER_LINE })));
}

// ---------- article pages and their collection index ----------
const DISCLOSURE_LINE = site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.';
for (const [coll, items] of Object.entries(collections)) {
  for (const it of items) {
    const rootPrefix = '../../', url = abs(`${coll}/${it.slug}/`);
    const hasAmazon = /amazon\.com/.test(it.body) || /\{\{BUY:/.test(it.body) || it.body.includes('{{FIT_FUNNEL}}') || it.body.includes('{{DEAL_LIST}}'); // the funnel, deals and buy buttons carry tagged links
    const byline = `<p class="byline">${it.front.cluster ? `<b>${esc(it.front.cluster)}</b>` : ''}${it.front.date ? `<span>${esc(new Date(it.front.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))}</span>` : ''}</p>`;
    const content = `<a class="backlink" href="../"><span aria-hidden="true">&larr;</span> All ${esc(coll)}</a>\n` + tools(md(it.body)).replace(/(<h1[^>]*>.*?<\/h1>)/, `$1\n${byline}${hasAmazon ? `\n<p class="disclosure">${esc(DISCLOSURE_LINE)}</p>` : ''}`);
    // FAQPage schema from a "Questions people ask" section: each ### question with the paragraph under it.
    const faq = [...it.body.matchAll(/^### (.+)\n+([^\n#].*)$/gm)].map(m => ({ '@type': 'Question', name: m[1].trim(), acceptedAnswer: { '@type': 'Answer', text: m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*?/g, '').trim() } }));
    const faqLd = faq.length && /^## Questions people ask/m.test(it.body) ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }] : [];
    const ld = it.front.merged_into ? null : [...faqLd, { '@context': 'https://schema.org', '@type': 'Article', headline: it.front.title, description: it.front.description || '', image: abs(it.front.image || (cfg.collection_share_images || {})[coll] || cfg.default_share_image), datePublished: it.front.date || undefined, dateModified: it.front.updated || it.front.date || undefined, url: base ? url : undefined, mainEntityOfPage: base ? url : undefined, author: org, publisher: org }, crumbs([[cfg.name, base ? `${base}/` : undefined], [coll[0].toUpperCase() + coll.slice(1), abs(`${coll}/`)], [it.front.title, url]])];
    written.push(wr(`${coll}/${it.slug}/index.html`, frame(pageTpl
      .replace('<!--META-->', meta({ title: `${it.front.title} · ${cfg.name}`, description: it.front.description || homeDesc, url: base ? (it.front.merged_into ? abs(`${coll}/${it.front.merged_into}/`) : url) : '', type: 'article', image: it.front.image || (cfg.collection_share_images || {})[coll], extra: (ld ? jsonld(ld) : '') + (it.front.merged_into ? '\n<meta name="robots" content="noindex,follow">' : '') }))
      .replace('<!--ANALYTICS-->', analytics)
      .replace('{{CONTENT}}', content), { rootPrefix, nav: '', footerLine: FOOTER_LINE, current: coll })));
  }
  const label = coll[0].toUpperCase() + coll.slice(1);
  const listed = items.filter(i => !i.front.merged_into);
  const groups = [...new Set(listed.map(i => i.front.cluster || ''))];
  const card = (i) => `<article class="guide-card"><h2><a href="${i.slug}/">${esc(i.front.card_title || i.front.title)}</a></h2><p>${esc(i.front.card_line || i.front.description || '')}</p><p class="actions"><a class="btn btn-primary btn-sm" href="${i.slug}/">Read the guide</a>${i.front.tool_anchor ? `<a class="btn btn-ghost btn-sm" href="${i.slug}/#${i.front.tool_anchor}">${esc(i.front.tool_label || 'Open the tool')}</a>` : ''}</p></article>`;
  const grouped = groups.some(g => listed.filter(i => (i.front.cluster || '') === g).length > 1);
  const list = groups.map(g => `${g && grouped ? `<h2 class="h2">${esc(g)}</h2>` : ''}${listed.filter(i => (i.front.cluster || '') === g).map(card).join('')}`).join('\n');
  const hubLd = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: (cfg.collection_titles || {})[coll] || label, url: abs(`${coll}/`), publisher: org, mainEntity: { '@type': 'ItemList', itemListElement: listed.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.front.title, url: abs(`${coll}/${i.slug}/`) })) } }, crumbs([[cfg.name, base ? `${base}/` : undefined], [label, abs(`${coll}/`)]])];
  const hubIntro = (cfg.collection_intros || {})[coll] ? `<p>${esc(cfg.collection_intros[coll])}</p>` : '';
  written.push(wr(`${coll}/index.html`, frame(pageTpl
    .replace('<!--META-->', meta({ title: (cfg.collection_titles || {})[coll] || `${label} · ${cfg.name}`, description: (cfg.collection_descriptions || {})[coll] || `The long version behind our picks: who each is for, what to check, and who should skip it.`, url: base ? abs(`${coll}/`) : '', image: (cfg.collection_share_images || {})[coll] , extra: jsonld(hubLd) }))
    .replace('<!--ANALYTICS-->', analytics)
    .replace('{{CONTENT}}', `<h1 class="h1">${esc(label)}</h1>${hubIntro}\n${list}`), { rootPrefix: '../', nav: '', footerLine: FOOTER_LINE, current: coll })));
}

// ---------- 404, manifest, robots, sitemap ----------
written.push(wr('404.html', frame(pageTpl
  .replace('<!--META-->', meta({ title: `Not found · ${cfg.name}`, description: 'That page is not on the shelf.' }) + '\n<meta name="robots" content="noindex">')
  .replace('<!--ANALYTICS-->', analytics), { rootPrefix: base ? new URL(base + '/').pathname : '/', nav: '', footerLine: FOOTER_LINE })
  .replace('{{CONTENT}}', `<h1 class="h1">That page is not on the shelf.</h1><p>The product may have been retired. <a href="${esc(base ? base + '/' : '/')}">Back to the shop</a>.</p>`)));
written.push(wr('manifest.webmanifest', JSON.stringify({ name: cfg.name, short_name: 'BuyRight', start_url: './', display: 'standalone', background_color: cfg.theme_color, theme_color: cfg.theme_color, icons: [{ src: 'brand/favicon.svg', sizes: 'any', type: 'image/svg+xml' }] }, null, 2)));
written.push(wr('robots.txt', `User-agent: *\nAllow: /\nDisallow: /data/\n${base ? `Sitemap: ${base}/sitemap.xml\n` : ''}`));
// Central date, not UTC: an evening build would otherwise stamp the home page with tomorrow (sitemap diagnosis, Sept 30).
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const urls = [{ loc: `${base}/`, lastmod: today }, ...buildable.map(p => ({ loc: `${base}/p/${p.product_id}/`, lastmod: p.last_offer_check })), ...TEXT_PAGES.filter(s => !textFront[s]?.merged_into).map(s => ({ loc: `${base}/${s}/`, lastmod: undefined })), ...Object.entries(collections).flatMap(([c, items]) => [{ loc: `${base}/${c}/`, lastmod: items.filter(i => !i.front.merged_into).map(i => i.front.date).filter(Boolean).sort().pop() }, ...items.filter(i => !i.front.merged_into).map(i => ({ loc: `${base}/${c}/${i.slug}/`, lastmod: i.front.date }))])];
written.push(wr('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(u.lastmod || '') ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`));

console.log(JSON.stringify({ data: dataFile, base_url: base || '(not set)', products_built: buildable.length, live_products: live.length, files: written.length, affiliate_links_enabled: site.affiliate_links_enabled === true, warnings: [!base && 'base_url is empty: canonical, sitemap and share URLs are relative', !cfg.contact_email && 'contact_email is empty: Contact page shows a placeholder', !cfg.pinterest_domain_verify && 'pinterest_domain_verify is empty'].filter(Boolean) }, null, 2));
