// BuyRight Notes storefront. Reads data/products.json (Codex's export); falls back to data/products.sample.json.
// Rules baked in: no Amazon prices/stars/badges (slots stay hidden until data-ready is set by an approved source),
// affiliate links only when site.affiliate_links_enabled is true, otherwise every button goes to the matching guide.
(async function () {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const preview = params.has('preview');
  const ROOT = window.__ROOT || ''; // '' on the home page, '../../' on product pages
  const track = (name, p, placement) => { try { if (typeof gtag === 'function') gtag('event', name, { product_id: p.product_id, asin: p.asin || '', placement }); } catch (e) {} };

  async function load() {
    if (window.__PRODUCTS) return Object.assign(window.__PRODUCTS, { _source: 'inline products.sample.json' });
    for (const src of [ROOT + 'data/products.json', ROOT + 'data/products.sample.json']) {
      try {
        const r = await fetch(src, { cache: 'no-store' });
        if (r.ok) { const j = await r.json(); j._source = src; return j; }
      } catch (e) { /* try next */ }
    }
    throw new Error('No product data');
  }

  let data;
  try { data = await load(); } catch (e) { $('hero-title').textContent = 'The store is being restocked.'; return; }
  const site = data.site || {};
  const sample = data._source.endsWith('sample.json');
  $('preview-note').hidden = !(sample || preview);

  // Production never shows example rows. Preview does, labeled.
  const showExamples = sample || preview;
  const products = (data.products || []).filter(p => showExamples ? true : (!p.example && p.status === 'LIVE'));
  const byId = new Map(products.map(p => [p.product_id, p]));

  // Buy links: tagged Special Link once the site is on the Associates list (site.affiliate_links_enabled),
  // otherwise a plain untagged Amazon product link. Never a redirect, never a shortener.
  const linksOn = site.affiliate_links_enabled === true;
  const buyHref = (p) => p.example ? '#' : (linksOn && p.amazon_url) ? p.amazon_url : (p.asin ? `https://www.amazon.com/dp/${p.asin}` : '#');
  const buyLabel = () => 'Buy on Amazon';
  const checkedLine = (p) => p.last_offer_check ? `Specs checked ${fmtDate(p.last_offer_check)}` : (p.example ? 'Example card for layout' : '');
  const setBuy = (a, p, placement = 'card') => { a.href = buyHref(p); a.textContent = buyLabel(); a.onclick = () => track('buy_click', p, placement); if (p.example) { a.setAttribute('aria-disabled', 'true'); a.removeAttribute('target'); } };
  const imgSrc = (src) => /^(https?:|data:)/.test(src) ? src : ROOT + src;
  function fmtDate(s) { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function media(p, cls) {
    const el = document.createElement('div'); el.className = cls;
    if (p.card_image) {
      const img = new Image(); img.src = imgSrc(p.card_image); img.alt = p.image_alt || ''; img.loading = cls.startsWith('hero') ? 'eager' : 'lazy'; img.decoding = 'async'; if (cls.startsWith('hero')) img.fetchPriority = 'high'; el.appendChild(img);
      const note = document.createElement('span'); note.className = 'image-note'; note.textContent = 'Illustrative image · check exact item on Amazon'; el.appendChild(note);
    }
    else { const t = document.createElement('div'); t.className = 'tint'; if (p.tint) t.style.setProperty('--tint', p.tint); el.appendChild(t); }
    return el;
  }
  const reelLabel = (id) => (data.reels || []).find(r => r.id === id)?.label || id;
  const chip = (p) => { const s = document.createElement('span'); s.className = 'chip' + (p.example ? ' chip-example' : ''); s.textContent = p.example ? 'Example' : reelLabel(p.category); return s; };

  // Hero: ?p=PRODUCT-ID from the Pin, else the first hero-eligible product.
  const heroId = params.get('p') || window.__HERO || '';
  const hero = byId.get(heroId) || products.find(p => p.hero_eligible && !p.example) || products.find(p => p.hero_eligible) || products[0];
  if (!hero) { $('hero-title').textContent = 'Nothing on the shelf yet.'; return; }
  $('hero-media').replaceWith(Object.assign(media(hero, 'hero-media'), { id: 'hero-media' }));
  $('hero-chip').replaceWith(Object.assign(chip(hero), { id: 'hero-chip' }));
  $('hero-title').textContent = hero.title;
  $('hero-why').textContent = hero.reason_to_buy ? `"${hero.reason_to_buy}"` : '';
  $('hero-checked').textContent = checkedLine(hero);
  $('hero-detail').textContent = hero.detail || '';
  const hgl = $('hero-guide-line'); hgl.hidden = !(hero.guide_url && !hero.example); $('hero-guide-link').href = hero.guide_url || '#';
  $('hero-more').addEventListener('toggle', (e) => { if (e.target.open) track('open_why', hero, 'hero'); });
  const cta = $('hero-cta'); setBuy(cta, hero, 'hero');
  $('hero-guide').hidden = true; // storefront funnel is Pin -> storefront -> Amazon; no guide detour
  document.title = `${hero.title} · ${site.name || 'BuyRight Notes'}`;
  $('disclosure').textContent = site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.';

  // Sticky buy bar appears when the hero button scrolls out of view.
  const bar = $('buybar'); $('buybar-name').textContent = hero.title; const bc = $('buybar-cta'); setBuy(bc, hero, 'sticky_bar'); bc.textContent = 'Buy on Amazon';
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { const show = !e.isIntersecting && e.boundingClientRect.top < 0; bar.classList.toggle('show', show); bar.setAttribute('aria-hidden', String(!show)); }, { threshold: 0 }).observe(cta);
  }

  // Reels: one per configured reel, filled at random from products tagged for it, hero excluded, 5-8 cards.
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const shelves = $('shelves');
  for (const reel of (data.reels || [])) {
    const pool = products.filter(p => (p.reels || [p.category]).includes(reel.id) && p.product_id !== hero.product_id);
    if (pool.length < 2) continue;
    const section = document.createElement('section'); section.className = 'shelf reveal'; section.setAttribute('aria-labelledby', `shelf-${reel.id}`);
    const head = document.createElement('div'); head.className = 'shelf-head';
    const h2 = document.createElement('h2'); h2.className = 'h2'; h2.id = `shelf-${reel.id}`; h2.textContent = reel.label;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-quiet btn-sm'; btn.textContent = 'Shuffle';
    head.append(h2, btn);
    const track = document.createElement('div'); track.className = 'reel mini spin'; track.setAttribute('role', 'list');
    const fill = () => { track.replaceChildren(...shuffle(pool.slice()).slice(0, 8).map(card)); track.scrollTo({ left: 0, behavior: 'auto' }); };
    btn.addEventListener('click', () => { track.classList.remove('spin'); void track.offsetWidth; fill(); track.classList.add('spin'); });
    fill();
    section.append(head, track);
    shelves.appendChild(section);
  }
  // Card: the picture and title open the note; the buy button goes straight to Amazon. Never nested inside each other.
  function card(p) {
    const c = document.createElement('article'); c.className = 'card reel-card'; c.setAttribute('role', 'listitem');
    const open = document.createElement('button'); open.type = 'button'; open.className = 'card-open'; open.setAttribute('aria-label', `${p.title}: see the note`);
    open.appendChild(media(p, 'card-media'));
    const body = document.createElement('div'); body.className = 'card-body';
    body.appendChild(chip(p));
    const h3 = document.createElement('h3'); h3.className = 'h3'; h3.textContent = p.title;
    const why = document.createElement('p'); why.className = 'why'; why.textContent = p.reason_to_buy ? `"${p.reason_to_buy}"` : '';
    body.append(h3, why); open.appendChild(body);
    open.addEventListener('click', () => openSheet(p));
    const buy = document.createElement('a'); buy.className = 'btn btn-primary btn-sm card-buy'; buy.rel = 'sponsored noopener'; buy.target = '_blank'; setBuy(buy, p);
    c.append(open, buy);
    return c;
  }

  // Detail sheet
  const sheet = $('sheet');
  function openSheet(p) {
    $('sheet-media').replaceWith(Object.assign(media(p, 'sheet-media'), { id: 'sheet-media' }));
    $('sheet-chip').replaceWith(Object.assign(chip(p), { id: 'sheet-chip' }));
    $('sheet-title').textContent = p.title;
    $('sheet-why').textContent = p.reason_to_buy ? `"${p.reason_to_buy}"` : '';
    $('sheet-detail').textContent = p.detail || '';
    $('sheet-checked').textContent = checkedLine(p);
    setBuy($('sheet-cta'), p, 'sheet');
    $('sheet-guide').hidden = true;
    track('view_note', p, 'sheet');
    const more = $('sheet-more'); more.hidden = !(p.guide_url && !p.example); $('sheet-more-link').href = p.guide_url || '#';
    sheet.showModal();
    $('sheet-close').focus({ preventScroll: true });
  }
  $('sheet-close').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });
})();
