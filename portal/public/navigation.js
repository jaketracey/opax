/* The site's one information architecture: five groups, drawn as a menu bar
   with full-width panels on wide screens and as a sheet on tablets and phones.
   Search and Ask sit beside the groups on every page. Loaded before app.js
   (and as a module on the home and community pages). */
(() => {
  // [href, label, blurb, gate]. A gated link appears only once its gate opens
  // (see `gates` below); a closed gate never advertises a dead route.
  const groups = [
    { id: 'parliament', label: 'Parliament', sub: 'Sitting weeks, bills and estimates',
      intro: 'What the chambers are doing, and the laws before them.', feature: 'week', columns: [
        { heading: 'In the chamber', links: [
          ['/sitting', 'Sitting weeks', 'Bills introduced and divisions held, week by week.'],
          ['/estimates', 'Senate estimates', 'Hearings, the agencies called and their recent awards.', 'estimates'],
        ] },
        { heading: 'Laws', links: [
          ['/bills', 'Bills', 'Federal bills: stages, votes, speeches and summaries.'],
          ['/instruments', 'Legislative instruments', 'Regulations and rules made under Acts.', 'instruments'],
        ] },
      ] },
    { id: 'people', label: 'People & places', sub: 'Parliamentarians, parties and electorates',
      intro: 'Who represents whom, and what they have declared.', feature: 'vic', columns: [
        { heading: 'People', links: [
          ['/subject/person', 'Parliamentarians', 'Speeches, recorded votes, pay and declared interests.'],
          ['/subject/party', 'Parties', 'Members, debate and disclosed receipts.'],
          ['/declared', 'Declared interests', 'Recent changes in the public registers.'],
        ] },
        { heading: 'Places', links: [
          ['/subject/electorate', 'Electorates', 'Representatives, election timelines and Census context.'],
          ['/vic-election-2026', 'Victorian election 2026', '88 districts and 8 regions, voting 28 November.', 'vic-election'],
        ] },
      ] },
    { id: 'money', label: 'Money', sub: 'Donations, contracts and grants',
      intro: 'Money into politics, and public money out to organisations.', feature: 'money', columns: [
        { heading: 'Political money', links: [
          ['/money', 'Money map', 'Who funds whom, across 28 years of returns.'],
          ['/money/receipts', 'Political receipts', 'Every disclosed receipt, sortable and exportable.'],
          ['/subject/donor', 'Donors', 'Organisations in the disclosure records.'],
          ['/subject/campaigner', 'Campaigners & third parties', 'Organisations spending on politics.'],
        ] },
        { heading: 'Public money', links: [
          ['/discover', 'Government contracts', 'Which agencies buy from whom.'],
          ['/subject/supplier', 'Suppliers', 'The organisations that win government contracts.'],
          ['/subject/agency', 'Agencies', 'Contract awards, by the agency that made them.'],
          ['/money/grants', 'Grants', 'Grant awards, resolved to their recipients.'],
          ['/connections', 'Programs & places', 'Where organisations, programs and places meet.'],
        ] },
      ] },
    { id: 'research', label: 'Topics & reports', sub: 'Debates by subject and sourced reports',
      intro: 'The debate by subject, and long reads built on the record.', columns: [
        { heading: 'Topics', links: [
          ['/subject/topic', 'Topics A–Z', 'Every debate in the record, by subject.'],
          ['/explore', 'Interactive tools', 'Time machine, the tide, the record quiz and more.'],
        ] },
        { heading: 'Reports', compact: true, all: ['/reports', 'All reports'], links: [
          ['/reports/grants-allocation', 'Where community funding goes'],
          ['/reports/climate', 'Climate & energy'],
          ['/reports/gambling', 'Gambling'],
          ['/reports/housing', 'Housing'],
          ['/reports/immigration', 'Immigration'],
          ['/reports/indigenous', 'First Nations'],
          ['/reports/media', 'Media ownership'],
          ['/audit', 'Queensland audit reports'],
        ] },
      ] },
    { id: 'about', label: 'About', sub: 'Methods, sources and the project',
      intro: 'Independent and open source. Every answer cites the record.', columns: [
        { heading: 'The project', links: [
          ['/about', 'About OPAX', 'What OPAX is and how answers are made.'],
          ['/community', 'Community', 'Reading lists and research, shared.'],
        ] },
        { heading: 'Using the record', links: [
          ['/methods', 'Methods & how to cite', 'Sources, limitations and citation formats.'],
          ['/stats', 'Sources & coverage', 'What the record holds, collection by collection.'],
        ] },
      ] },
  ];
  // Reached from the footer (and in context), never from the menus.
  const footerOnly = [['/expenses', 'Expense definitions'], ['/privacy', 'Privacy'], ['/support', 'Support']];
  // The sheet's first shortcuts: common first tasks, the same for every reader
  // (nothing about this reader's history is kept). [href, label, week, gate]
  const shortcuts = [
    ['/sitting', 'This sitting week', true],
    ['/subject/electorate', 'Find your electorate'],
    ['/money', 'Who funds whom'],
    ['/bills', 'Latest bills'],
    ['/vic-election-2026', 'Victorian election', false, 'vic-election'],
  ];
  // Compatibility view for callers that read one flat list per group.
  const sections = groups.map(g => ({ id: g.id, label: g.label, children: g.columns.flatMap(c => c.links) }));
  const money = [ ['/money', '3D connections'], ['/money/receipts', 'Political receipts'], ['/discover', 'Government contracts'], ['/money/grants', 'Grants'], ['/connections', 'Programs & places'] ];
  /** The group a path belongs to; null for Home, Ask, Search and records. */
  const active = (path, params = new URLSearchParams()) => {
    if (/^\/(money|map|discover|connections)(\/|$)/.test(path)) return 'money';
    if (/^\/subject\/(donor|supplier|agency|campaigner)(\/|$)/.test(path)) return 'money';
    if (path === '/explore') return ['ledger','grants','wd'].includes(params.get('game')) ? 'money' : 'research';
    if (/^\/(subject\/topic|reports|audit|explore)(\/|$)/.test(path)) return 'research';
    if (/^\/(subject|declared|vic-election-2026)(\/|$)/.test(path)) return 'people';
    if (/^\/(sitting|estimates|bills?|instruments?)(\/|$)/.test(path)) return 'parliament';
    if (/^\/(about|methods|stats|expenses|privacy|support|community)(\/|$)/.test(path)) return 'about';
    return null;
  };
  // From this width the band draws the menu bar; narrower, the Menu button and its sheet.
  const FULL_NAV = '(min-width: 961px)';
  // From this width the sheet lays every group out open, in columns.
  const WIDE_SHEET = '(min-width: 641px)';
  const esc = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  const CARET = '<svg class="nav-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ARROW = '<svg class="nav-arrow" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // Contracts and the connections directory are not split by jurisdiction.
  const oneJurisdiction = new Set(['/discover', '/connections']);
  function moneyNav(path, jur) {
    jur = jur || /^\/money\/grants\/(federal|qld)\/recipient\//.exec(path)?.[1];
    return `<nav class="area-nav money-area-nav" aria-label="Money">${money.map(([href,label]) => `<a href="${href}${jur && jur !== 'federal' && !oneJurisdiction.has(href) ? '?jur='+encodeURIComponent(jur) : ''}"${href===path || href==='/money/grants' && path.startsWith('/money/grants/')?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  }

  // --- gates: optional sections that exist only on some deployments ---------
  const gates = { instruments: false, 'vic-election': false, estimates: false };
  const gateWaiters = [];
  function openGate(name, href) {
    gates[name] = href || true;
    for (const fn of gateWaiters) fn(name);
  }
  const visible = link => !link[3] || gates[link[3]];
  const hrefOf = link => typeof gates[link[3]] === 'string' ? gates[link[3]] : link[0];
  // A closed gate draws an empty, hidden slot: no address in the page until it
  // opens, when the slot is filled in place (the drawn controls keep their handlers).
  const slots = new Map();
  let slotSeq = 0;
  function itemHTML(link, inner, attrs = '') {
    if (visible(link)) return `<li${attrs}>${inner()}</li>`;
    slots.set(++slotSeq, inner);
    return `<li${attrs} data-gate-slot="${link[3]}" data-slot="${slotSeq}" hidden></li>`;
  }

  // --- this week in parliament, from the published sitting calendar ---------
  // Fetched once, the first time a menu opens (9 KB); every page that draws the
  // band can show it, and a failure just leaves the plain links.
  let week = null;
  let weekRequest = null;
  const sydneyDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
  // The site's three-letter months (format.js MONTHS; a classic script keeps a copy).
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = iso => Number(iso.slice(8, 10));
  const month = iso => MONTHS[Number(iso.slice(5, 7)) - 1];
  // "12–15 Oct", or "28 Oct – 2 Nov" across a month.
  const dateRange = (a, b) => a.slice(0, 7) === b.slice(0, 7) ? `${day(a)}–${day(b)} ${month(b)}` : `${day(a)} ${month(a)} – ${day(b)} ${month(b)}`;
  const HOUSES = { representatives: 'House of Representatives', senate: 'Senate' };
  let vicRequest = null;
  function loadWeek() {
    // The Victorian election hub is published only where its flag is on; its
    // facts asset answers 404 otherwise. (Prototype: one HEAD on the first open.
    // The Worker can mark the document instead, which costs no request.)
    if (document.documentElement.dataset.navGates?.split(' ').includes('vic-election')) openGate('vic-election');
    else vicRequest ??= fetch('/hubs/vic-election-2026.json', { method: 'HEAD' }).then(r => { if (r.ok) openGate('vic-election'); }).catch(() => {});
    return weekRequest ??= fetch('/hubs/index.json').then(r => r.ok ? r.json() : null).then(index => {
      const today = sydneyDay();
      const weeks = (index?.weeks || []).filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w.start) && w.end >= today).sort((a, b) => a.start.localeCompare(b.start));
      const next = weeks[0];
      const estimates = weeks.find(w => w.estimates);
      if (estimates && /^[\w-]+$/.test(estimates.estimates)) openGate('estimates', `/estimates/${estimates.estimates}`);
      if (!next) return null;
      week = { href: `/sitting/${next.start}`, now: next.start <= today, range: dateRange(next.start, next.end),
        houses: next.houses.map(h => HOUSES[h] || h).join(' and ') };
      for (const fn of gateWaiters) fn('week');
      return week;
    }).catch(() => null);
  }

  // --- drawing ----------------------------------------------------------------
  const linkHTML = (link, cls) => `<a class="${cls}" href="${esc(hrefOf(link))}">`;
  function featureHTML(group) {
    if (group.feature === 'week') {
      return week
        ? `<a class="nav-feature" href="${esc(week.href)}"><span class="nav-feature-kicker">${week.now ? 'Sitting now' : 'Next sitting'}</span><span class="nav-feature-title">${esc(week.range)}</span><span class="nav-feature-meta">${esc(week.houses)}</span><span class="nav-feature-more">Bills and divisions${ARROW}</span></a>`
        : `<a class="nav-feature" href="/sitting"><span class="nav-feature-kicker">The calendar</span><span class="nav-feature-title">Sitting weeks</span><span class="nav-feature-meta">Every federal sitting week, past and upcoming.</span><span class="nav-feature-more">See the calendar${ARROW}</span></a>`;
    }
    if (group.feature === 'vic') return gates['vic-election'] ? `<a class="nav-feature" href="/vic-election-2026"><span class="nav-feature-kicker">Votes on 28 November</span><span class="nav-feature-title">Victorian election 2026</span><span class="nav-feature-meta">Every district and region, its sitting member and their record.</span><span class="nav-feature-more">See the seats${ARROW}</span></a>` : '';
    if (group.feature === 'money') return `<a class="nav-feature" href="/money"><span class="nav-feature-kicker">Explore</span><span class="nav-feature-title">The money map</span><span class="nav-feature-meta">Donors, parties and public money as one territory you can turn.</span><span class="nav-feature-more">Open the map${ARROW}</span></a>`;
    return '';
  }
  function panelHTML(group, links) {
    const cols = group.columns.map(col => {
      const items = col.links.filter(links);
      if (!items.length && !col.links.some(l => l[3])) return '';
      return `<div class="nav-col${col.compact ? ' nav-col-compact' : ''}"><p class="nav-col-h">${esc(col.heading)}</p><ul class="nav-links" role="list">${col.links.filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'nav-item-link')}<span class="nav-item-title">${esc(l[1])}</span>${l[2] && !col.compact ? `<span class="nav-item-blurb">${esc(l[2])}</span>` : ''}</a>`)).join('')}</ul>${col.all ? `<a class="nav-all" href="${col.all[0]}">${esc(col.all[1])}${ARROW}</a>` : ''}</div>`;
    }).join('');
    return `<div class="wrap nav-panel-inner"><div class="nav-intro"><p class="nav-intro-title">${esc(group.label)}</p><p class="nav-intro-text">${esc(group.intro)}</p></div>${cols}<div class="nav-feature-slot" data-feature="${group.feature || ''}">${featureHTML(group)}</div></div>`;
  }
  const desktopHTML = (links) => groups.map(g => `<li class="nav-group" data-group="${g.id}"><button type="button" class="nav-trigger" data-nav-trigger="${g.id}" aria-expanded="false" aria-controls="menu-${g.id}">${esc(g.label)}${CARET}</button><div class="nav-panel" id="menu-${g.id}" data-group="${g.id}" hidden>${panelHTML(g, links)}</div></li>`).join('');
  const sheetHTML = (links) => `<a class="sheet-ask" href="/ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg><span><span class="sheet-ask-title">Ask OPAX</span><span class="sheet-ask-sub">Ask a question of the public record</span></span>${ARROW}</a>`
    + `<section class="sheet-start" aria-labelledby="sheet-start-h"><h2 class="sheet-kicker" id="sheet-start-h">Start here</h2><ul class="sheet-chips" role="list">${shortcuts.filter(s => links(s)).map(s => s[2]
      ? `<li><a class="sheet-chip" data-week href="${esc(week ? week.href : s[0])}">${esc(s[1])}</a></li>`
      : itemHTML(s, () => `<a class="sheet-chip" href="${esc(hrefOf(s))}">${esc(s[1])}</a>`)).join('')}</ul></section>`
    + `<div class="sheet-groups">${groups.map(g => `<section class="sheet-group" data-group="${g.id}"><h2 class="sheet-group-h"><button type="button" class="sheet-group-toggle" aria-expanded="false" aria-controls="sheet-${g.id}"><span class="sheet-group-text"><span class="sheet-group-label">${esc(g.label)}</span><span class="sheet-group-sub">${esc(g.sub)}</span></span>${CARET}</button></h2><div class="sheet-group-body" id="sheet-${g.id}" hidden>${g.columns.map(col => `<p class="sheet-col-h">${esc(col.heading)}</p><ul class="sheet-links" role="list">${col.links.filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'sheet-link')}${esc(l[1])}</a>`)).join('')}${col.all ? `<li><a class="sheet-link sheet-link-all" href="${col.all[0]}">${esc(col.all[1])}</a></li>` : ''}</ul>`).join('')}</div></section>`).join('')}</div>`
    + `<p class="sheet-foot">${footerOnly.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('')}</p>`;
  const footerHTML = (links) => groups.map(g => `<div class="footer-col"><h2 class="footer-col-h">${esc(g.label)}</h2><ul role="list">${g.columns.flatMap(c => c.links).filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'footer-link')}${esc(l[1])}</a>`)).join('')}${g.id === 'about' ? footerOnly.map(([href, label]) => `<li><a class="footer-link" href="${href}">${esc(label)}</a></li>`).join('') : ''}</ul></div>`).join('');

  /** Marks the links to this page and the group that holds it. */
  function markCurrent(root = document) {
    const path = location.pathname;
    const group = active(path, new URLSearchParams(location.search));
    for (const t of root.querySelectorAll('[data-nav-trigger]')) t.classList.toggle('is-current', t.dataset.navTrigger === group);
    for (const s of root.querySelectorAll('.sheet-group')) s.classList.toggle('is-current', s.dataset.group === group);
    for (const a of root.querySelectorAll('.nav-item-link, .sheet-link, .footer-link, .sheet-chip')) {
      const href = a.getAttribute('href');
      const base = href.split('?')[0];
      // The page itself, or (one step up) the section page it sits under.
      if (base === path) a.setAttribute('aria-current', 'page');
      else if (base !== '/money' && path.startsWith(base + '/')) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }

  // --- the menu bar: disclosure panels ---------------------------------------
  // Keyboard, pointer, dismissal and focus return. Hover opens on fine
  // pointers only; a click right after a hover-open confirms instead of closing.
  const desktopKey = Symbol.for('opax.navigation.desktop');
  function mountDesktop({ onOpen = () => {} } = {}) {
    const nav = document.getElementById('primary-nav');
    if (!nav) return { close() {} };
    if (nav[desktopKey]) { nav[desktopKey].listeners.push(onOpen); return nav[desktopKey]; }
    const listeners = [onOpen];
    const header = nav.closest('header');
    const menus = [...nav.querySelectorAll('.nav-group')].map(item => ({
      item, btn: item.querySelector('[data-nav-trigger]'), panel: item.querySelector('.nav-panel'),
    })).filter(m => m.btn && m.panel);
    let open = null;
    let timer = 0;
    const hoverFine = matchMedia('(hover: hover) and (pointer: fine)');
    function set(m, on, { focus = false } = {}) {
      clearTimeout(timer);
      if (on) {
        const switching = !!open && open !== m;
        if (open && open !== m) set(open, false);
        loadWeek();
        for (const fn of listeners) fn(m.panel);
        m.panel.classList.toggle('is-switch', switching);
        m.panel.hidden = false;
        m.btn.setAttribute('aria-expanded', 'true');
        header?.classList.add('nav-is-open');
        open = m;
        if (focus) m.panel.querySelector('a:not([hidden])')?.focus();
      } else {
        m.panel.hidden = true;
        m.btn.setAttribute('aria-expanded', 'false');
        m.byHover = false;
        if (open === m) { open = null; header?.classList.remove('nav-is-open'); }
      }
    }
    for (const m of menus) {
      m.btn.addEventListener('click', () => {
        if (open === m && m.byHover) { m.byHover = false; return; }
        set(m, open !== m);
      });
      m.btn.addEventListener('keydown', (e) => {
        // Down opens the panel at its first link; Left/Right walk the bar.
        if (e.key === 'ArrowDown') { e.preventDefault(); set(m, true, { focus: true }); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const i = menus.indexOf(m) + (e.key === 'ArrowRight' ? 1 : -1);
          const to = menus[(i + menus.length) % menus.length];
          to.btn.focus();
          if (open) set(to, true);
        }
      });
      m.item.addEventListener('mouseenter', () => {
        if (!hoverFine.matches) return;
        clearTimeout(timer);
        if (open === m) return;
        // A short intent delay keeps a pointer crossing the bar from flashing panels;
        // once one is open, moving along the bar swaps at once.
        timer = setTimeout(() => { set(m, true); m.byHover = true; }, open ? 0 : 90);
      });
      m.item.addEventListener('mouseleave', () => {
        if (!hoverFine.matches) return;
        clearTimeout(timer);
        timer = setTimeout(() => { if (open === m) set(m, false); }, 180);
      });
      // Following a panel link closes the panel even when it is the current page.
      m.panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(m, false); });
      m.item.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && open === m) { e.stopPropagation(); set(m, false); m.btn.focus(); }
      });
      // Tabbing past the panel's last link closes it quietly.
      m.item.addEventListener('focusout', (e) => { if (open === m && !m.item.contains(e.relatedTarget)) set(m, false); });
    }
    document.addEventListener('pointerdown', (e) => { if (open && !open.item.contains(e.target)) set(open, false); });
    for (const type of ['hashchange', 'popstate', 'opax:route']) window.addEventListener(type, () => { if (open) set(open, false); });
    // Narrowing to the sheet's widths closes a panel the bar no longer shows.
    matchMedia(FULL_NAV).addEventListener?.('change', (e) => { if (!e.matches && open) set(open, false); });
    return nav[desktopKey] = { listeners, close() { if (open) set(open, false); } };
  }

  // --- the sheet: tablets and phones -------------------------------------------
  // A modal <dialog>: the page behind is inert while it is open; Tab is held
  // inside it, Escape closes it, and focus returns to the control that opened it.
  const drawerKey = Symbol.for('opax.navigation.drawer');
  function mountDrawer({ navigate = href => location.assign(href) } = {}) {
    const $ = id => document.getElementById(id);
    const drawer = $('nav-drawer');
    const toggle = $('nav-open');
    if (!drawer || !toggle) return { close() {} };
    if (drawer[drawerKey]) return drawer[drawerKey];
    const searchToggle = $('nav-search-open');
    let opener = toggle;
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const expanded = (on) => { for (const t of [toggle, searchToggle]) t?.setAttribute('aria-expanded', String(on)); };
    function setGroup(btn, on) {
      btn.setAttribute('aria-expanded', String(on));
      const body = $(btn.getAttribute('aria-controls'));
      if (body) body.hidden = !on;
    }
    // Closing animates the sheet out before the dialog actually closes; every
    // close path goes through here so the motion is the same from a link, the
    // close button, the backdrop or Escape.
    function close() {
      if (!drawer.open || drawer.classList.contains('is-closing')) return;
      if (reduced()) { drawer.close(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; drawer.classList.remove('is-closing'); drawer.close(); };
      drawer.classList.add('is-closing');
      drawer.addEventListener('animationend', (e) => { if (e.target === drawer) finish(); }, { once: true });
      setTimeout(finish, 320); // the animation is 240ms; this is the safety net
    }
    function show(from, focusSearch) {
      opener = from;
      loadWeek();
      // Wide sheets lay every group out open; on a phone, the group holding
      // this page starts open and the rest fold.
      const wide = matchMedia(WIDE_SHEET).matches;
      const here = active(location.pathname, new URLSearchParams(location.search));
      for (const btn of drawer.querySelectorAll('.sheet-group-toggle')) setGroup(btn, wide || btn.closest('.sheet-group')?.dataset.group === here);
      drawer.showModal();
      // The dialog itself takes focus, so a tap on Menu does not land a focus
      // ring on the first control; Tab still reaches everything.
      if (focusSearch) $('drawer-q')?.focus({ preventScroll: true });
      else drawer.focus({ preventScroll: true });
      expanded(true);
    }
    toggle.addEventListener('click', () => show(toggle, false));
    searchToggle?.addEventListener('click', () => show(searchToggle, true));
    drawer.addEventListener('close', () => {
      if (!matchMedia(FULL_NAV).matches) opener.focus({ preventScroll: true });
      expanded(false);
    });
    // Escape: the same exit motion instead of the instant native close.
    drawer.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    drawer.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // A suggestion list open under the search field takes Escape first.
        if (e.target.id === 'drawer-q' && !$('drawer-sugg')?.hidden) return;
        e.preventDefault(); close(); return;
      }
      if (e.key !== 'Tab') return;
      // Hold Tab inside the sheet (the native modal does too; this keeps the
      // cycle the same in every engine, the dialog itself included).
      const stops = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.closest('[hidden]') && el.getClientRects().length);
      if (!stops.length) return;
      const first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $('drawer-close')?.addEventListener('click', () => close());
    // A search typed into the sheet lands on the Search page with the query.
    $('drawer-search')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = $('drawer-q').value.trim();
      if (!q) return;
      close();
      $('drawer-q').value = '';
      $('drawer-sugg').hidden = true;
      navigate(`/ask?view=search&q=${encodeURIComponent(q)}`);
    });
    drawer.addEventListener('click', (e) => {
      const groupBtn = e.target.closest('.sheet-group-toggle');
      if (groupBtn) { setGroup(groupBtn, groupBtn.getAttribute('aria-expanded') !== 'true'); return; }
      // A link tap navigates and dismisses the sheet.
      if (e.target.closest('a')) { close(); return; }
      const r = drawer.getBoundingClientRect(); // outside the panel = backdrop
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) close();
    });
    // Growing past the sheet's widths with it open would strand a modal over a
    // page that now shows the full menu bar.
    matchMedia(FULL_NAV).addEventListener?.('change', (e) => { if (e.matches && drawer.open) drawer.close(); });
    return drawer[drawerKey] = { close, open: () => show(toggle, false) };
  }

  // The page's menus are drawn and wired once, however often this script runs.
  const initialised = Symbol.for('opax.navigation.page');
  if (typeof document !== 'undefined' && document[initialised]) return;
  globalThis.OpaxNavigation = { groups, sections, money, active, moneyNav, mountDesktop, mountDrawer, markCurrent, FULL_NAV };
  if (typeof document === 'undefined') return;
  document[initialised] = true;
  // Audit and instrument pages carry no person links (the Worker strips them
  // from the server HTML); the menus drawn here follow the same rule.
  const instrumentPage = /^\/(?:instruments?|audit)(\/|$)/.test(location.pathname);
  const links = link => !(instrumentPage && link[0].startsWith('/subject/person'));
  const desktop = document.querySelector('#primary-nav .nav-list');
  const mobile = document.querySelector('#nav-drawer .sheet-nav');
  const footer = document.getElementById('footer-index');
  const draw = () => {
    if (desktop) desktop.innerHTML = desktopHTML(links);
    if (mobile) mobile.innerHTML = sheetHTML(links);
    if (footer) footer.innerHTML = footerHTML(links);
    markCurrent();
  };
  draw();
  // A gate that opens later reveals its links in place: the drawn controls keep
  // their handlers, and nothing moves under a reader mid-menu except the reveal.
  gateWaiters.push((name) => {
    // Feature cards follow their data (the week) or their gate (the election).
    for (const slot of document.querySelectorAll('.nav-feature-slot[data-feature]')) {
      const group = groups.find(g => g.feature && g.feature === slot.dataset.feature);
      if (group && (name === 'week' ? group.feature === 'week' : group.feature !== 'week')) slot.innerHTML = featureHTML(group);
    }
    if (name === 'week') {
      for (const chip of document.querySelectorAll('.sheet-chip[data-week]')) chip.setAttribute('href', week.href);
      markCurrent();
      return;
    }
    for (const li of document.querySelectorAll(`[data-gate-slot="${name}"]`)) {
      li.innerHTML = slots.get(Number(li.dataset.slot))?.() || '';
      li.removeAttribute('data-gate-slot');
      li.hidden = false;
    }
    markCurrent();
  });
  for (const type of ['popstate', 'opax:route']) window.addEventListener(type, () => markCurrent());
  // A missing or incomplete optional catalogue must not advertise a dead route.
  const instrumentsReady = fetch('/instruments/ready.json').then(r => r.ok ? r.json() : null).then(ready => {
    if (ready?.complete !== true || !Number.isInteger(ready.count) || ready.count < 1
      || !Number.isInteger(ready.exported) || ready.exported < 1
      || !Number.isInteger(ready.unresolved_gap) || ready.unresolved_gap < 0 || ready.unresolved_gap > 10
      || ready.unresolved_gap * 2000 > ready.count || ready.exported + ready.unresolved_gap < ready.count
      || !Number.isInteger(ready.count_start) || ready.count_start < 1 || ready.count_end !== ready.count
      || !Number.isInteger(ready.drift) || ready.drift !== ready.count_end-ready.count_start || Math.abs(ready.drift)>50
      || ready.tail_sweep?.complete !== true
      || !['requests','pages','prefix_pages','fetched','rounds'].every(k=>Number.isInteger(ready.tail_sweep[k]) && ready.tail_sweep[k]>=0)
      || ready.tail_sweep.requests>300 || ready.tail_sweep.pages>ready.tail_sweep.requests
      || ready.tail_sweep.prefix_pages>ready.tail_sweep.pages || ready.tail_sweep.fetched>ready.tail_sweep.requests || ready.tail_sweep.rounds>3
      || !Array.isArray(ready.gap_pages) || !ready.gap_pages.every(p=>p && Number.isInteger(p.offset)
        && p.offset >= 0 && p.offset % 100 === 0 && p.offset < ready.count
        && Number.isInteger(p.unresolved_gap) && p.unresolved_gap > 0 && p.unresolved_gap <= 100)
      || new Set(ready.gap_pages.map(p=>p.offset)).size !== ready.gap_pages.length
      || ready.gap_pages.reduce((n,p)=>n+p.unresolved_gap,0) !== ready.unresolved_gap
      || !/^\d{4}-\d{2}-\d{2}$/.test(ready.export_date || '')
      || !Number.isFinite(Date.parse(ready.export_date))) return;
    openGate('instruments');
  }).catch(() => {});
  globalThis.OpaxNavigation.instrumentsReady = instrumentsReady;
  // Server-only pages (sitting weeks, estimates, the Victorian election hub,
  // audit, instruments, not found) have no page script of their own, so their
  // menus, sheet and header search are wired here. app.js, home.js and
  // community.js mount the same controls themselves.
  if (!document.querySelector('script[src^="/app.js"], script[src^="/home.js"], script[src^="/community.js"]')) {
    mountDesktop(); mountDrawer();
    const searchHref = q => `/ask?view=search&q=${encodeURIComponent(q)}`;
    // Without the app's suggestion engine the field offers one row: search the record.
    const attachSearch = () => globalThis.OpaxQuickSearch?.attach(document.getElementById('mast-q'), document.getElementById('mast-sugg'), {
      idPrefix: 'ms', searchHref, navigate: href => location.assign(href),
      source: async q => [{ label: `Search the record for “${q}”`, type: 'Search', href: searchHref(q) }],
      beforeGo: () => globalThis.OpaxQuickSearch?.header?.close(),
    });
    // quick-search.js is deferred after this script; it has run by DOMContentLoaded.
    if (globalThis.OpaxQuickSearch) attachSearch();
    else document.addEventListener('DOMContentLoaded', attachSearch, { once: true });
  }
  // "/" opens the header search from anywhere that is not already a field.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const t = e.target;
    if (t.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], dialog[open]')) return;
    const open = document.getElementById('header-search-open');
    if (!open || !open.getClientRects().length || open.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    open.click();
  });
  for (const node of document.querySelectorAll('[data-money-navigation]')) node.innerHTML = moneyNav(location.pathname, new URLSearchParams(location.search).get('jur'));
  // The band's Ask control on pages the app does not run on (sitting weeks,
  // estimates, audit, instruments, community, not found): the same control, as
  // a link to the Ask page, where the app pages open the docked conversation.
  // Not on the home page, whose first block is the question box.
  if (location.pathname !== '/' && !document.querySelector('script[src^="/app.js"]')) {
    document.getElementById('chat-launcher')?.remove();
    document.getElementById('header-search-panel')?.insertAdjacentHTML('afterend', '<a class="chat-launcher" href="/ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg><span>Ask OPAX</span></a>');
  }
})();
