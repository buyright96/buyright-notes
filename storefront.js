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
    }
    else { const t = document.createElement('div'); t.className = 'tint'; if (p.tint) t.style.setProperty('--tint', p.tint); el.appendChild(t); }
    return el;
  }
  // "Why we picked it" content: plain lines are the reason, lines starting "+ " are highlight bullets,
  // and a line starting "Skip it if" is who should pass. Built with textContent only.
  function fillDetail(el, text) {
    const lines = String(text || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
    const kids = []; let ul = null;
    for (const line of lines) {
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
  const bar = $('buybar'); $('buybar-name').textContent = hero.title; const bc = $('buybar-cta'); setBuy(bc, hero, 'sticky_bar'); bc.textContent = 'Buy on Amazon';
  const setBar = (show) => { bar.classList.toggle('show', show); bar.toggleAttribute('inert', !show); bar.setAttribute('aria-hidden', String(!show)); };
  if ('IntersectionObserver' in window) {
    setBar(false);
    new IntersectionObserver(([e]) => setBar(!e.isIntersecting), { threshold: 0 }).observe(cta);
  }

  // Reels: one per configured reel, filled at random from products tagged for it, hero excluded, 5-8 cards.
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const shelves = $('shelves');
  // The slot spin plays once, when a shelf is 30% on screen (not at load, when shelves sit below the fold).
  const spinIO = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.replace('armed', 'spin'); spinIO.unobserve(e.target); } }, { threshold: 0.3 }) : null;
  for (const reel of (data.reels || [])) {
    const pool = products.filter(p => (p.reels || [p.category]).includes(reel.id) && p.product_id !== hero.product_id);
    if (!pool.length) continue; // every category with a product gets a shelf, so the category bar never points at nothing
    const section = document.createElement('section'); section.className = 'shelf'; section.id = reel.id; section.dataset.label = reel.label; section.setAttribute('aria-labelledby', `shelf-${reel.id}`);
    const head = document.createElement('div'); head.className = 'shelf-head';
    const h2 = document.createElement('h2'); h2.className = 'h2'; h2.id = `shelf-${reel.id}`; h2.textContent = reel.label;
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn btn-quiet btn-sm'; btn.textContent = 'Shuffle';
    head.append(h2, btn); btn.hidden = pool.length < 2; // nothing to shuffle with one card
    const track = document.createElement('div'); track.className = 'reel mini armed'; track.setAttribute('role', 'list');
    const fill = () => { track.replaceChildren(...shuffle(pool.slice()).slice(0, 8).map(card)); track.scrollTo({ left: 0, behavior: 'auto' }); };
    // Shuffle answers the visitor, so it uses a short 420ms settle instead of the full first-view spin.
    btn.addEventListener('click', () => { track.classList.remove('armed', 'spin', 'reshuffle'); void track.offsetWidth; fill(); track.classList.add('spin', 'reshuffle'); });
    fill();
    if (spinIO) spinIO.observe(track); else track.classList.replace('armed', 'spin');
    section.append(head, track);
    shelves.appendChild(section);
  }

  // Category bar: "All picks" plus one chip per shelf. On the home page chips jump to their shelf (a shareable #hash);
  // on product pages they go home to that shelf. The chip for the section you are looking at is highlighted.
  const onHome = !ROOT;
  const nav = $('catnav');
  const sections = [...shelves.querySelectorAll('section.shelf')];
  if (nav && sections.length) {
    const links = [['top', 'All picks'], ...sections.map(s => [s.id, s.dataset.label])].map(([id, label]) => {
      const a = document.createElement('a'); a.textContent = label; a.dataset.target = id;
      a.href = id === 'top' ? (onHome ? '#top' : ROOT + './') : (onHome ? `#${id}` : `${ROOT}./#${id}`);
      if (onHome && id === 'top') a.addEventListener('click', (e) => { e.preventDefault(); history.pushState(null, '', location.pathname + location.search); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); });
      return a;
    });
    nav.replaceChildren(...links);
    const header = document.querySelector('.top');
    const setNavH = () => document.documentElement.style.setProperty('--nav-h', `${header.offsetHeight + 8}px`);
    setNavH(); addEventListener('resize', setNavH, { passive: true });
    const setActive = (id) => {
      for (const a of links) { const on = a.dataset.target === id; a.toggleAttribute('aria-current', on); if (on) nav.scrollTo({ left: a.offsetLeft - nav.clientWidth / 2 + a.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' }); }
    };
    if (onHome) {
      setActive('top');
      // Scroll-spy: the shelf nearest the top of the screen owns the highlight; above the first shelf it is "All picks".
      if ('IntersectionObserver' in window) {
        const seen = new Map();
        const spy = new IntersectionObserver((es) => {
          for (const e of es) seen.set(e.target.id, e.isIntersecting);
          const current = sections.find(s => seen.get(s.id));
          setActive(current && current.getBoundingClientRect().top < innerHeight * 0.6 ? current.id : 'top');
        }, { rootMargin: '-35% 0px -40% 0px' });
        sections.forEach(s => spy.observe(s));
      }
      // Arriving with #kitchen (from a product page chip): shelves are built by script, so jump once they exist.
      const want = decodeURIComponent(location.hash.slice(1));
      if (want && sections.some(s => s.id === want)) requestAnimationFrame(() => { document.getElementById(want).scrollIntoView({ block: 'start' }); setActive(want); });
    }
  } else if (nav) nav.hidden = true;
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
    fillDetail($('sheet-detail'), p.detail);
    $('sheet-checked').textContent = checkedLine(p);
    setBuy($('sheet-cta'), p, 'sheet');
    $('sheet-guide').hidden = true;
    // Every product has its own page: a link to open and share it (hidden for examples and for the page you are on).
    const page = $('sheet-page'); page.href = `${ROOT}p/${p.product_id}/`; page.hidden = !!p.example || window.__HERO === p.product_id && !onHome;
    track('view_note', p, 'sheet');
    const more = $('sheet-more'); more.hidden = !(p.guide_url && !p.example); $('sheet-more-link').href = p.guide_url || '#';
    sheet.showModal();
    $('sheet-close').focus({ preventScroll: true });
  }
  // Every close slides the sheet back down to the edge it came from, then closes the dialog.
  const inner = sheet.querySelector('.sheet-inner');
  function closeSheet() {
    if (!sheet.open || sheet.classList.contains('closing')) return;
    inner.style.transform = '';
    if (reduceMotion) { sheet.close(); return; }
    sheet.classList.add('closing');
    const done = () => { clearTimeout(t); inner.removeEventListener('animationend', done); sheet.classList.remove('closing'); sheet.close(); };
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
      if (dy > inner.offsetHeight * 0.3 || vel > 0.11) { inner.style.transform = 'translateY(100%)'; setTimeout(() => { inner.style.transition = ''; inner.style.transform = ''; sheet.close(); }, 300); }
      else { inner.style.transform = ''; setTimeout(() => { inner.style.transition = ''; }, 300); }
    };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  }
})();
