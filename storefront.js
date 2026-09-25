// BuyRight Notes storefront. Reads data/products.json (Codex's export); falls back to data/products.sample.json.
// Rules baked in: no Amazon prices/stars/badges (slots stay hidden until data-ready is set by an approved source),
// affiliate links only when site.affiliate_links_enabled is true, otherwise every button goes to the matching guide.
(async function () {
  const $ = (id) => document.getElementById(id);
  // iOS Safari and the Pinterest in-app browser only fire :active press states when a touchstart listener exists.
  document.addEventListener('touchstart', () => {}, { passive: true });
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const params = new URLSearchParams(location.search);
  const preview = params.has('preview');
  const ROOT = window.__ROOT || ''; // '' on the home page, '../../' on product pages
  const onHome = !ROOT;
  document.body.classList.add(onHome ? 'is-home' : 'is-product');
  // A product page's top item is the product the visitor tapped on Pinterest, not a featured hero (owner, Sept 24).
  const fromPinterest = /pinterest/i.test(params.get('utm_source') || '') || /(^|\.)pinterest\./i.test((() => { try { return new URL(document.referrer).hostname; } catch (e) { return ''; } })());
  // Which Pin sent this visitor (utm_content A/B/C), so buy clicks can be compared per image style (decision 31).
  const pinVariant = (() => { try { const v = new URLSearchParams(location.search).get('utm_content') || ''; return /^[A-Za-z0-9_-]{1,20}$/.test(v) ? v : ''; } catch (e) { return ''; } })();
  const track = (name, p, placement) => { try { if (typeof gtag === 'function') gtag('event', name, { product_id: p.product_id, asin: p.asin || '', placement, pin_variant: pinVariant }); } catch (e) {} };

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
  const previewNote = $('preview-note'); if (previewNote) previewNote.hidden = !(sample || preview); // only sample builds carry it

  // Production never shows example rows. Preview does, labeled.
  const showExamples = sample || preview;
  const products = (data.products || []).filter(p => showExamples ? true : (!p.example && p.status === 'LIVE'));
  const byId = new Map(products.map(p => [p.product_id, p]));

  // Buy links: tagged Special Link once the site is on the Associates list (site.affiliate_links_enabled),
  // otherwise a plain untagged Amazon product link. Never a redirect, never a shortener.
  const linksOn = site.affiliate_links_enabled === true;
  // Internal mode (set in the page head from ?internal=on): our own visits get plain, untagged Amazon links, so our
  // clicks never count as affiliate clicks, and a small chip says so (tap it to turn internal mode off).
  const internal = window.__INTERNAL === true;
  const plain = (p) => p.asin ? `https://www.amazon.com/dp/${p.asin}` : '#';
  const buyHref = (p) => p.example ? '#' : internal ? plain(p) : (linksOn && p.amazon_url) ? p.amazon_url : plain(p);
  if (internal && !/^(localhost|127\.)/.test(location.hostname)) {
    const tag = Object.assign(document.createElement('a'), { className: 'internal-chip', href: '?internal=off', textContent: 'Internal · not counted', title: 'This browser is marked as ours: visits are labeled internal and Buy links are untagged. Tap to turn off.' });
    document.querySelector('.top .spacer')?.after(tag);
  }
  const buyLabel = () => 'Buy on Amazon';
  const checkedLine = (p) => p.last_offer_check ? `Specs checked ${fmtDate(p.last_offer_check)}` : (p.example ? 'Example card for layout' : '');
  const setBuy = (a, p, placement = 'card') => { a.href = buyHref(p); a.textContent = buyLabel(); a.onclick = () => track('buy_click', p, placement); if (p.example) { a.setAttribute('aria-disabled', 'true'); a.removeAttribute('target'); } };
  const imgSrc = (src) => /^(https?:|data:)/.test(src) ? src : ROOT + src;
  function fmtDate(s) { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? s : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function media(p, cls) {
    const el = document.createElement('div'); el.className = cls;
    if (p.card_image) {
      const img = new Image(); img.src = imgSrc(p.card_image); img.alt = p.image_alt || ''; img.loading = cls.startsWith('hero') ? 'eager' : 'lazy'; img.decoding = 'async'; img.draggable = false; if (cls.startsWith('hero')) img.fetchPriority = 'high'; el.appendChild(img);
    }
    else { const t = document.createElement('div'); t.className = 'tint'; if (p.tint) t.style.setProperty('--tint', p.tint); el.appendChild(t); }
    return el;
  }
  // "Why we picked it" content: plain lines are the reason, lines starting "+ " are highlight bullets, "Label: value"
  // lines (Size, Fits, Includes ...) become the facts grid, and a line starting "Skip it if" is who should pass.
  // Built with textContent only. build.mjs pre-renders the same structure for the product at the top of each page.
  const SPEC_LABELS = new Set(['Size', 'Weight', 'Fits', 'Works with', 'Capacity', 'Includes', 'Tank', 'Power', 'Battery', 'Screen', 'Runtime', 'Care', 'Hopper', 'Pitcher', 'Bowl', 'Connects', 'Cord', 'Hose', 'Burrs', 'Colors', 'Formula', 'Skin', 'Brews', 'Speeds', 'Pressure', 'Cleanup', 'Oven', 'Sounds', 'Storage']);
  function fillDetail(el, text) {
    const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const kids = []; let ul = null, dl = null;
    for (const line of lines) {
      const spec = line.match(/^([A-Z][A-Za-z ]{1,12}):\s+(.+)$/);
      if (spec && SPEC_LABELS.has(spec[1])) { ul = null; if (!dl) { dl = document.createElement('dl'); dl.className = 'specs'; kids.push(dl); } const dt = document.createElement('dt'); dt.textContent = spec[1]; const dd = document.createElement('dd'); dd.textContent = spec[2]; dl.append(dt, dd); continue; }
      dl = null;
      if (line.startsWith('+ ')) { if (!ul) { ul = document.createElement('ul'); ul.className = 'highlights'; kids.push(ul); } const li = document.createElement('li'); li.textContent = line.slice(2); ul.appendChild(li); continue; }
      ul = null; const p = document.createElement('p'); p.className = /^skip it if/i.test(line) ? 'skip' : 'reason'; p.textContent = line; kids.push(p);
    }
    el.replaceChildren(...kids);
  }
  const reelLabel = (id) => (data.reels || []).find(r => r.id === id)?.label || id;
  const chip = (p) => { const s = document.createElement('span'); s.className = 'chip' + (p.example ? ' chip-example' : ''); s.textContent = p.example ? 'Example' : reelLabel(p.category); return s; };

  // Hero: ?p=PRODUCT-ID from the Pin, else the first hero-eligible product.
  const heroId = params.get('p') || window.__HERO || '';
  const hero = byId.get(heroId) || products.find(p => p.hero_eligible && !p.example) || products.find(p => p.hero_eligible) || products[0];
  if (!hero) { $('hero-title').textContent = 'Nothing on the shelf yet.'; return; }
  // The build pre-renders the hero photo; keep it when it is already the right product, so nothing pops or shifts.
  const heroImg = $('hero-media').querySelector('img');
  if (!(heroImg && hero.card_image && heroImg.getAttribute('src').endsWith(hero.card_image))) $('hero-media').replaceWith(Object.assign(media(hero, 'hero-media'), { id: 'hero-media' }));
  $('hero-chip').replaceWith(Object.assign(chip(hero), { id: 'hero-chip' }));
  if (!onHome && fromPinterest && !hero.example) { const c = $('hero-chip'); c.textContent = 'Your Pinterest pick'; c.classList.add('chip-pin'); }
  if (onHome && !hero.example) $('hero-chip').textContent = 'Newest pick'; // the home hero is the latest pick, not a category
  $('hero-title').textContent = hero.title;
  $('hero-why').textContent = hero.reason_to_buy ? `"${hero.reason_to_buy}"` : '';
  $('hero-checked').textContent = checkedLine(hero);
  fillDetail($('hero-detail'), hero.detail);
  const hgl = $('hero-guide-line'); hgl.hidden = !(hero.guide_url && !hero.example); $('hero-guide-link').href = hero.guide_url || '#';
  $('hero-more').addEventListener('toggle', (e) => { if (e.target.open) track('open_why', hero, 'hero'); });
  const cta = $('hero-cta'); setBuy(cta, hero, 'hero');
  $('hero-guide').hidden = true; // storefront funnel is Pin -> storefront -> Amazon; no guide detour
  // Built pages already carry the right title (product pages repeat their Pin's title); only a ?p= swap needs a new one.
  if (params.get('p')) document.title = `${hero.title} · ${site.name || 'BuyRight Notes'}`;
  $('disclosure').textContent = site.disclosure || 'As an Amazon Associate we earn from qualifying purchases.';

  // Sticky buy bar: shown whenever the hero Buy button is off-screen, above OR below, so a visitor always has a Buy button in view.
  // It steps aside while a wheel's own buttons pass through the strip of screen it covers (on a 375 px phone the wheel's
  // Buy and "Why we picked it" sat half under it; caught by 01_WORKSPACE/tools/storefront_mobile_check.mjs).
  const bar = $('buybar'); $('buybar-name').textContent = hero.title; const bc = $('buybar-cta'); setBuy(bc, hero, 'sticky_bar'); bc.textContent = 'Buy on Amazon';
  const setBar = (show) => { bar.classList.toggle('show', show); bar.toggleAttribute('inert', !show); bar.setAttribute('aria-hidden', String(!show)); };
  let watchUnderBar = () => {};
  if ('IntersectionObserver' in window) {
    setBar(false);
    let heroOff = false, zone = null;
    const under = new Set(), watched = [], sync = () => setBar(heroOff && !under.size);
    new IntersectionObserver(([e]) => { heroOff = !e.isIntersecting; sync(); }, { threshold: 0 }).observe(cta);
    const makeZone = () => { // the bar's strip, measured from the bar itself; rebuilt when the screen height changes
      zone?.disconnect(); under.clear();
      zone = new IntersectionObserver((es) => { for (const e of es) e.isIntersecting ? under.add(e.target) : under.delete(e.target); sync(); },
        { rootMargin: `-${Math.max(0, innerHeight - bar.offsetHeight - 8)}px 0px 0px 0px` });
      watched.forEach(el => zone.observe(el));
    };
    makeZone(); addEventListener('resize', () => requestAnimationFrame(makeZone));
    watchUnderBar = (el) => { watched.push(el); zone.observe(el); };
    watchUnderBar($('hero-more')); // the open notes on a product page: no line of them sits under the bar while you read
  }

  // Wheels (owner, Sept 24): every category is a rotating wheel. Three pictures are always fully on screen, the middle one
  // active with its name, reason and Buy button underneath; arrows, swipe, arrow keys or a tap on a side picture turn it,
  // looping through everything posted in that category. The home page has a wheel per category (the category bar jumps
  // to them); a product page has two: its own category, then Hot deals.
  const shelves = $('shelves');
  const categories = (data.reels || []).map(r => ({ ...r, items: products.filter(p => (p.reels || [p.category]).includes(r.id)) })).filter(r => r.items.length);
  let wheelCats = categories;
  if (!onHome) {
    const own = categories.find(r => r.id === hero.category && r.items.length > 1) || categories.find(r => r.id !== 'hot_deals' && r.items.length > 1);
    wheelCats = [own, categories.find(r => r.id === 'hot_deals')].filter((r, i, a) => r && a.indexOf(r) === i);
  }
  // The first-view spin plays once, when a wheel is a third on screen (not at load, when wheels sit below the fold).
  const spinIO = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { spinIO.unobserve(e.target); e.target._spin(); } }, { threshold: 0.35 }) : null;
  shelves.replaceChildren(); // the build's plain lists (for crawlers and no-script visitors) give way to the wheels
  for (const cat of wheelCats) {
    const section = wheel(cat);
    shelves.appendChild(section);
    if (spinIO) spinIO.observe(section.querySelector('.wheel')); else section.querySelector('.wheel')._spin();
  }

  // Category bar: "All picks" plus one chip per category that has a product (every category, even on product pages).
  // A chip jumps to its wheel when that wheel is on this page (a shareable #hash); otherwise it goes home to that wheel.
  // The chip for the section you are looking at is highlighted, on every page.
  const nav = $('catnav');
  const sections = [...shelves.querySelectorAll('section.shelf')];
  const here = (id) => sections.some(s => s.id === id);
  if (nav && categories.length) {
    const links = [['top', 'All picks'], ...categories.map(c => [c.id, c.label])].map(([id, label]) => {
      const a = document.createElement('a'); a.textContent = label; a.dataset.target = id;
      a.href = id === 'top' ? (onHome ? '#top' : ROOT + './') : (here(id) ? `#${id}` : `${ROOT}./#${id}`);
      if (onHome && id === 'top') a.addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
      return a;
    });
    nav.replaceChildren(...links);
    const header = document.querySelector('.top');
    const setNavH = () => document.documentElement.style.setProperty('--nav-h', `${header.offsetHeight + 8}px`);
    setNavH(); addEventListener('resize', setNavH, { passive: true });
    const setActive = (id) => {
      for (const a of links) { const on = a.dataset.target === id; a.toggleAttribute('aria-current', on); if (on && nav.scrollWidth > nav.clientWidth + 1) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' }); }
    };
    // Scroll-spy: the shelf nearest the top of the screen owns the highlight. Above the first shelf it is "All picks"
    // on the home page and the product's own category on a product page.
    const rest = onHome || !categories.some(c => c.id === hero.category) ? 'top' : hero.category;
    setActive(rest);
    if ('IntersectionObserver' in window) {
      const seen = new Map();
      const spy = new IntersectionObserver((es) => {
        for (const e of es) seen.set(e.target.id, e.isIntersecting);
        const current = sections.find(s => seen.get(s.id));
        setActive(current && current.getBoundingClientRect().top < innerHeight * 0.6 ? current.id : rest);
      }, { rootMargin: '-35% 0px -40% 0px' });
      sections.forEach(s => spy.observe(s));
    }
    // Arriving with #kitchen (from another page's chip): shelves are built by script, so jump once they exist.
    const want = decodeURIComponent(location.hash.slice(1));
    if (want && here(want)) requestAnimationFrame(() => { document.getElementById(want).scrollIntoView({ block: 'start' }); setActive(want); });
  } else if (nav) nav.hidden = true;

  // Product pages end with every category as a tile, so the whole shop is one tap away from any Pin (owner, Sept 24:
  // "navigation that takes you to a home area that shows all of the sections"). Tiles open that wheel on the home page.
  const grid = $('catgrid');
  if (grid && !onHome && categories.length) {
    const tiles = $('catgrid-tiles'); tiles.replaceChildren(); // the build pre-renders the same tiles
    for (const cat of categories) {
      const a = document.createElement('a'); a.className = 'tile'; a.href = `${ROOT}./#${cat.id}`;
      if (cat.id === hero.category) a.setAttribute('aria-current', 'true');
      const pic = cat.items.find(p => p.product_id !== hero.product_id) || cat.items[0];
      a.appendChild(media(pic, 'card-media'));
      const b = document.createElement('b'); b.textContent = cat.label;
      const s = document.createElement('span'); s.textContent = `${cat.items.length} ${cat.items.length === 1 ? 'pick' : 'picks'}`;
      a.append(b, s); tiles.appendChild(a);
    }
    grid.hidden = false;
  }
  // One wheel. With 3+ products the strip holds three copies of the list and the middle picture always sits in the middle
  // copy, so turning never runs out; after each turn it hops back to the same picture in the middle copy with motion off.
  // With 1-2 products the pictures just sit centred and a tap picks which one is described below.
  function wheel(cat) {
    const make = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
    const items = cat.items, n = items.length, loop = n >= 3;
    const section = make('section', 'shelf'); section.id = cat.id; section.dataset.label = cat.label; section.setAttribute('aria-labelledby', `shelf-${cat.id}`);
    const head = make('div', 'shelf-head');
    const h2 = make('h2', 'h2'); h2.id = `shelf-${cat.id}`; h2.textContent = cat.label;
    const ctrls = make('div', 'wheel-ctrls'); ctrls.hidden = n < 2;
    const arrow = (dir, label) => { const b = make('button', 'wheel-btn'); b.type = 'button'; b.setAttribute('aria-label', label); b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`; b.addEventListener('click', () => go(dir)); return b; };
    const count = make('span', 'wheel-count'); count.setAttribute('aria-hidden', 'true');
    ctrls.append(arrow(-1, `Previous ${cat.label} pick`), count, arrow(1, `Next ${cat.label} pick`));
    head.append(h2, ctrls);

    const stage = make('div', 'wheel armed' + (loop ? ' loop' : '')); stage.setAttribute('role', 'group'); stage.setAttribute('aria-roledescription', 'carousel'); stage.setAttribute('aria-labelledby', h2.id);
    const strip = make('div', 'wheel-strip');
    const copies = loop ? [...items, ...items, ...items] : items;
    let swiped = false;
    const slides = copies.map((p, i) => {
      const b = make('button', 'wheel-item'); b.type = 'button'; b.appendChild(media(p, 'card-media'));
      b.addEventListener('click', () => { if (swiped) { swiped = false; return; } const off = i - center; if (!off) openSheet(p); else if (loop) go(Math.sign(off)); else { center = i; render(); } });
      return b;
    });
    strip.append(...slides); stage.appendChild(strip);

    // Underneath: the middle product's name, reason and buttons. A status line tells screen readers which pick is showing.
    const info = make('div', 'wheel-info');
    const infoChip = make('span', 'chip'), title = make('h3', 'h3'), why = make('p', 'why');
    const actions = make('div', 'wheel-actions');
    const buy = make('a', 'btn btn-primary btn-sm'); buy.rel = 'sponsored noopener'; buy.target = '_blank';
    const note = make('button', 'btn btn-ghost btn-sm'); note.type = 'button'; note.textContent = 'Why we picked it';
    actions.append(buy, note); watchUnderBar(actions);
    const status = make('p', 'visually-hidden'); status.setAttribute('aria-live', 'polite');
    info.append(infoChip, title, why, actions, status);
    section.append(head, stage, info);

    // Start on the first product that is not the one this page is about.
    const first = Math.max(0, items.findIndex(p => p.product_id !== hero.product_id || onHome));
    let center = loop ? n + first : first, settleT = 0, shown = null;
    const setK = () => strip.style.setProperty('--k', String(center - 1));
    function render(announce) {
      slides.forEach((s, i) => {
        const off = i - center, vis = loop ? Math.abs(off) <= 1 : true;
        s.classList.toggle('active', off === 0); s.classList.toggle('left', off === -1); s.classList.toggle('right', off === 1);
        s.tabIndex = vis ? 0 : -1; s.inert = !vis; s.setAttribute('aria-hidden', String(!vis));
        s.setAttribute('aria-label', off === 0 ? `${copies[i].title}: why we picked it` : `Show ${copies[i].title}`);
      });
      const p = items[center % n];
      count.textContent = `${(center % n) + 1} / ${n}`;
      if (p === shown) return;
      shown = p;
      const here = !onHome && p.product_id === hero.product_id;
      infoChip.textContent = here ? 'On this page' : reelLabel(p.category); infoChip.className = 'chip' + (here ? ' chip-here' : '');
      title.textContent = p.title; why.textContent = p.reason_to_buy ? `"${p.reason_to_buy}"` : '';
      buy.removeAttribute('aria-disabled'); buy.target = '_blank'; setBuy(buy, p, 'wheel'); // setBuy disables example rows
      note.onclick = () => openSheet(p);
      if (announce) status.textContent = `${p.title}, ${(center % n) + 1} of ${n}`;
      if (!reduceMotion) { info.classList.remove('swap'); void info.offsetWidth; info.classList.add('swap'); }
    }
    // Hop to the same picture in the middle copy with motion off, so the next turn always has neighbours on both sides.
    const recentre = () => { if (!loop || (center >= n && center < 2 * n)) return; center = ((center % n) + n) % n + n; stage.classList.add('no-anim'); setK(); render(); void strip.offsetWidth; stage.classList.remove('no-anim'); };
    function go(d) {
      if (n < 2) return;
      const hadFocus = stage.contains(document.activeElement);
      if (loop) { clearTimeout(settleT); strip.classList.remove('spinning'); recentre(); center += d; setK(); render(true); settleT = setTimeout(recentre, 420); }
      else { center = (center + d + n) % n; render(true); }
      if (hadFocus) slides[center].focus({ preventScroll: true });
    }
    stage.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(e.key === 'ArrowLeft' ? -1 : 1); } });
    // Swipe: a mostly-sideways flick past 40px turns one step; vertical page scrolling is left alone (touch-action: pan-y).
    if (window.PointerEvent && n > 1) {
      let x0 = null, y0 = 0;
      stage.addEventListener('pointerdown', (e) => { swiped = false; if (e.pointerType === 'mouse' && e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; });
      stage.addEventListener('pointerup', (e) => { if (x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null; if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { swiped = true; go(dx < 0 ? 1 : -1); } });
      stage.addEventListener('pointercancel', () => { x0 = null; });
    }
    // First view: the wheel spins once through the whole category and settles on its first pick (slot-reel feel, under 1s).
    stage._spin = () => {
      stage.classList.remove('armed');
      if (!loop || reduceMotion) return;
      const target = center; center = target - n;
      stage.classList.add('no-anim'); setK(); render(); void strip.offsetWidth; stage.classList.remove('no-anim');
      strip.classList.add('spinning'); center = target; setK(); render();
      settleT = setTimeout(() => strip.classList.remove('spinning'), 1000);
    };
    setK(); render();
    return section;
  }

  // Detail sheet
  const sheet = $('sheet');
  function openSheet(p) {
    $('sheet-media').replaceWith(Object.assign(media(p, 'sheet-media'), { id: 'sheet-media' }));
    $('sheet-chip').replaceWith(Object.assign(chip(p), { id: 'sheet-chip' }));
    $('sheet-title').textContent = p.title;
    $('sheet-why').textContent = p.reason_to_buy ? `"${p.reason_to_buy}"` : '';
    fillDetail($('sheet-detail'), p.detail);
    $('sheet-checked').textContent = checkedLine(p);
    setBuy($('sheet-cta'), p, 'sheet');
    $('sheet-guide').hidden = true;
    // Every product has its own page: a link to open and share it (hidden for examples and for the page you are on).
    const page = $('sheet-page'); page.href = `${ROOT}p/${p.product_id}/`; page.hidden = !!p.example || window.__HERO === p.product_id && !onHome;
    track('view_note', p, 'sheet');
    const more = $('sheet-more'); more.hidden = !(p.guide_url && !p.example); $('sheet-more-link').href = p.guide_url || '#';
    // Always open at the photo and name. iPhone Safari scrolls a dialog to whatever gets focus, and showModal focuses the
    // first button (Buy, near the bottom), so focus goes to the title at the top and the scroll is reset again once the
    // sheet is on screen (owner's screen recording, 2026-09-24: the note opened on its bottom buttons).
    inner.scrollTop = 0;
    sheet.showModal();
    $('sheet-title').focus({ preventScroll: true });
    inner.scrollTop = 0;
    requestAnimationFrame(() => { inner.scrollTop = 0; requestAnimationFrame(() => { inner.scrollTop = 0; }); });
  }
  // Every close slides the sheet back down to the edge it came from, then closes the dialog.
  const inner = sheet.querySelector('.sheet-inner');
  function closeSheet() {
    if (!sheet.open || sheet.classList.contains('closing')) return;
    inner.style.transform = '';
    if (reduceMotion) { inner.scrollTop = 0; sheet.close(); return; }
    sheet.classList.add('closing');
    const done = () => { clearTimeout(t); inner.removeEventListener('animationend', done); sheet.classList.remove('closing'); inner.scrollTop = 0; sheet.close(); };
    const t = setTimeout(done, 300);
    inner.addEventListener('animationend', done);
  }
  $('sheet-close').addEventListener('click', closeSheet);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(); });

  // Drag the grip down to dismiss: follows the finger, resists upward pulls, closes past 30% of the height or on a quick flick.
  const grip = sheet.querySelector('.grip');
  if (grip && window.PointerEvent) {
    let startY = 0, lastY = 0, lastT = 0, vel = 0, dragging = false;
    grip.addEventListener('pointerdown', (e) => { dragging = true; startY = lastY = e.clientY; lastT = performance.now(); vel = 0; grip.setPointerCapture(e.pointerId); inner.style.transition = 'none'; });
    grip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const now = performance.now(); vel = (e.clientY - lastY) / Math.max(1, now - lastT); lastY = e.clientY; lastT = now;
      const dy = e.clientY - startY; inner.style.transform = `translateY(${dy > 0 ? dy : dy * 0.2}px)`;
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      const dy = lastY - startY;
      inner.style.transition = 'transform 300ms var(--ease-drawer)';
      if (dy > inner.offsetHeight * 0.3 || vel > 0.11) { inner.style.transform = 'translateY(100%)'; setTimeout(() => { inner.style.transition = ''; inner.style.transform = ''; inner.scrollTop = 0; sheet.close(); }, 300); }
      else { inner.style.transform = ''; setTimeout(() => { inner.style.transition = ''; }, 300); }
    };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  }
})();
