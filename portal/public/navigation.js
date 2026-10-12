/* The site's one information architecture: five groups, drawn as a menu bar
   with full-width panels on wide screens, as a sheet on tablets and phones,
   and as the footer's site index; the breadcrumb trail of every page comes
   from the same list. Search and Ask sit beside the groups on every page.
   Loaded before app.js (and as a module on the home and community pages); the
   Worker imports it too, for the server's trails and the static fallbacks. */
(() => {
  // A page: its address, its one name (the menu's, the trail's and the
  // title's), a line for the menu, and two optional marks. `gate`: an optional
  // section, kept out of the page until it is known to be published. `record`:
  // a page inside its column's section (a report inside Reports), not one.
  const page = (href, label, blurb = '', more = {}) => ({ href, label, blurb, ...more });
  const groups = [
    { id: 'parliament', label: 'Parliament', href: '/sitting', sub: 'Sitting weeks, bills and estimates',
      intro: 'What the chambers are doing, and the laws before them.', feature: 'week', columns: [
        { heading: 'In the chamber', links: [
          page('/sitting', 'Sitting weeks', 'Bills introduced and divisions held, week by week.'),
          page('/estimates', 'Senate estimates', 'Hearings, the agencies called and their recent awards.', { gate: 'estimates' }),
        ] },
        { heading: 'Laws', links: [
          page('/bills', 'Bills', 'Federal bills: stages, votes, speeches and summaries.'),
          page('/instruments', 'Legislative instruments', 'Regulations and rules made under Acts.', { gate: 'instruments' }),
        ] },
      ] },
    { id: 'people', label: 'People & places', href: '/subject/person', sub: 'Parliamentarians, parties and electorates',
      intro: 'Who represents whom, and what they have declared.', feature: 'vic', columns: [
        { heading: 'People', links: [
          page('/subject/person', 'Parliamentarians', 'Speeches, recorded votes, pay and declared interests.'),
          page('/subject/party', 'Parties', 'Members, debate and disclosed receipts.'),
          page('/declared', 'Declared interests', 'Recent changes in the public registers.'),
        ] },
        { heading: 'Places', links: [
          page('/subject/electorate', 'Electorates', 'Representatives, election timelines and Census context.'),
          page('/vic-election-2026', 'Victorian election 2026', '88 districts and 8 regions, voting 28 November.', { gate: 'vic-election' }),
        ] },
      ] },
    { id: 'money', label: 'Money', href: '/money', sub: 'Donations, contracts and grants',
      intro: 'Money into politics, and public money out to organisations.', feature: 'money', columns: [
        { heading: 'Political money', links: [
          page('/money', 'Money map', 'Who funds whom, across 28 years of returns.'),
          page('/money/receipts', 'Political receipts', 'Every disclosed receipt, sortable and exportable.'),
          page('/subject/donor', 'Donors', 'Organisations in the disclosure records.'),
          page('/subject/campaigner', 'Campaigners & third parties', 'Organisations spending on politics.'),
        ] },
        { heading: 'Public money', links: [
          page('/discover', 'Government contracts', 'Which agencies buy from whom.'),
          page('/subject/supplier', 'Suppliers', 'The organisations that win government contracts.'),
          page('/subject/agency', 'Agencies', 'Contract awards, by the agency that made them.'),
          page('/money/grants', 'Grants', 'Grant awards, resolved to their recipients.'),
          page('/connections', 'Programs & places', 'Where organisations, programs and places meet.'),
        ] },
      ] },
    { id: 'research', label: 'Topics & reports', href: '/reports', sub: 'Debates by subject and sourced reports',
      intro: 'The debate by subject, and long reads built on the record.', columns: [
        { heading: 'Topics', links: [
          page('/subject/topic', 'Topics A–Z', 'Every debate in the record, by subject.'),
          page('/explore', 'Interactive tools', 'Time machine, the tide, the record quiz and more.'),
        ] },
        // Each report keeps the title its own page gives it.
        { heading: 'Reports', compact: true, section: page('/reports', 'Reports'), more: 'All reports', links: [
          page('/reports/grants-allocation', 'Where community funding goes', '', { record: true }),
          page('/reports/climate', 'Climate & Energy', '', { record: true }),
          page('/reports/gambling', 'Gambling', '', { record: true }),
          page('/reports/housing', 'Housing', '', { record: true }),
          page('/reports/immigration', 'Immigration', '', { record: true }),
          page('/reports/indigenous', 'First Nations', '', { record: true }),
          page('/reports/media', 'Media Ownership', '', { record: true }),
          page('/audit', 'Queensland audit reports'),
        ] },
      ] },
    { id: 'about', label: 'About', href: '/about', sub: 'Methods, sources and the project',
      intro: 'Independent and open source. Every answer cites the record.', columns: [
        { heading: 'The project', links: [
          page('/about', 'About OPAX', 'What OPAX is and how answers are made.'),
          page('/community', 'Community', 'Reading lists and research, shared.'),
        ] },
        { heading: 'Using the record', links: [
          page('/methods', 'Methods & how to cite', 'Sources, limitations and citation formats.'),
          page('/stats', 'Sources & coverage', 'What the record holds, collection by collection.'),
        ] },
      ] },
  ];
  // In the footer's site index (and the sheet's last line), never the menus.
  // Privacy is in both on every page: one tap from anywhere.
  const footerOnly = [page('/expenses', 'Expense definitions'), page('/privacy', 'Privacy'), page('/support', 'Support')];
  // The sheet's first shortcuts: common first tasks, the same for every reader.
  // Nothing about a reader's history is kept.
  const shortcuts = [
    page('/sitting', 'This sitting week', '', { week: true }),
    page('/subject/electorate', 'Find your electorate'),
    page('/money', 'Who funds whom'),
    page('/bills', 'Latest bills'),
    page('/vic-election-2026', 'Victorian election', '', { gate: 'vic-election' }),
  ];
  // Pages reached in context (an answer, a result, a record), not from the menus.
  const ASK = page('/ask', 'Ask');
  const SEARCH = page('/ask?view=search', 'Search');
  const CHAT = page('/chat', 'Keep asking');
  // The About pages sit under About OPAX in the trail.
  const UNDER_ABOUT = new Set(['/methods', '/stats', '/expenses', '/privacy', '/support', '/community']);

  const menuPages = groups.flatMap(g => g.columns.flatMap(c => [...c.links, ...(c.section ? [c.section] : [])]));
  const sectionPages = new Map([...menuPages, ...footerOnly].filter(p => !p.record).map(p => [p.href, p]));
  // Compatibility view for callers that read one flat list per group: [href, label, blurb].
  const sections = groups.map(g => ({ id: g.id, label: g.label, children: g.columns.flatMap(c => c.links).map(l => [l.href, l.label, l.blurb]) }));
  const money = [ ['/money', 'Money map'], ['/money/receipts', 'Political receipts'], ['/discover', 'Government contracts'], ['/money/grants', 'Grants'], ['/connections', 'Programs & places'] ];

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

  // --- breadcrumbs: Home › the section page › the record ----------------------
  // Groups are menus, not pages, so they are never a step. Every label is the
  // page's one name from the list above; the record's own name comes from the
  // caller (a person, a bill, a report), shortened to keep the strip one line.
  const clip = (s, max = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };
  function placeOf(path, params) {
    if (path === '/search' || (path === '/ask' && params.get('view') === 'search')) return { page: SEARCH };
    if (path === '/ask') return { page: ASK };
    if (path === '/chat') return { parent: ASK, page: CHAT };
    if (path.startsWith('/doc/')) return { section: SEARCH };
    if (path.startsWith('/estimates/')) return { section: sectionPages.get('/sitting') };
    if (path.startsWith('/instrument/')) return { section: sectionPages.get('/instruments') };
    if (path.startsWith('/bill/')) return { section: sectionPages.get('/bills') };
    if (path === '/explore' && params.get('game')) return { section: sectionPages.get('/explore') };
    const exact = sectionPages.get(path);
    if (exact) return { page: exact, parent: UNDER_ABOUT.has(path) ? sectionPages.get('/about') : null };
    // Otherwise the longest section the address sits under: /reports/housing in
    // Reports, /money/grants/federal/recipient/… in Grants.
    let best = null;
    for (const p of sectionPages.values()) if (path.startsWith(p.href + '/') && (!best || p.href.length > best.href.length)) best = p;
    return best ? { section: best } : null;
  }
  /** The trail after Home for an address ("/path?query"): [{ label, href? }].
   *  Each record step after it is a name, or { label, href } for a step the
   *  caller can link (a division's bill); the last step is the page itself. */
  function trail(address = '/', ...records) {
    const [pathPart, query = ''] = String(address).split('#')[0].split('?');
    const p = pathPart.replace(/(.)\/+$/, '$1') || '/';
    if (p === '/') return [];
    const at = placeOf(p, new URLSearchParams(query));
    if (!at) return [{ label: 'Page not found' }];
    const steps = at.parent ? [{ label: at.parent.label, href: at.parent.href }] : [];
    const tail = records.filter(r => r && (typeof r === 'string' ? r.trim() : r.label))
      .map(r => typeof r === 'string' ? { label: clip(r) } : { label: clip(r.label), ...(r.href ? { href: r.href } : {}) });
    if (at.page && !tail.length) return [...steps, { label: at.page.label }];
    const anchor = at.page || at.section;
    return [...steps, { label: anchor.label, href: anchor.href }, ...tail];
  }

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

  // --- gates: optional sections published on some deployments only -----------
  // The Worker marks the ones it knows (<html data-nav-gates="vic-election">);
  // the instruments catalogue and the estimates round are read from their data.
  const gates = { instruments: false, 'vic-election': false, estimates: false };
  const gateWaiters = [];
  function openGate(name, href) {
    if (gates[name] && (!href || gates[name] === href)) return;
    gates[name] = href || true;
    for (const fn of gateWaiters) fn(name);
  }
  const visible = link => !link.gate || gates[link.gate];
  const hrefOf = link => typeof gates[link.gate] === 'string' ? gates[link.gate] : link.href;
  // A closed gate draws an empty, hidden slot: no address in the page until it
  // opens, when the slot is filled in place (the drawn controls keep their handlers).
  const slots = new Map();
  let slotSeq = 0;
  function itemHTML(link, inner, { slot = true } = {}) {
    if (visible(link)) return `<li>${inner()}</li>`;
    if (!slot) return '';
    slots.set(++slotSeq, inner);
    return `<li data-gate-slot="${link.gate}" data-slot="${slotSeq}" hidden></li>`;
  }

  // --- this week in parliament, from the published sitting calendar ---------
  // Fetched once, the first time a menu opens (9 KB); a failure just leaves the
  // plain links.
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
  function loadWeek() {
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
    const cols = group.columns.map(col => `<div class="nav-col${col.compact ? ' nav-col-compact' : ''}"><p class="nav-col-h">${esc(col.heading)}</p><ul class="nav-links" role="list">${col.links.filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'nav-item-link')}<span class="nav-item-title">${esc(l.label)}</span>${l.blurb && !col.compact ? `<span class="nav-item-blurb">${esc(l.blurb)}</span>` : ''}</a>`)).join('')}</ul>${col.section ? `<a class="nav-all" href="${col.section.href}">${esc(col.more)}${ARROW}</a>` : ''}</div>`).join('');
    return `<div class="wrap nav-panel-inner"><div class="nav-intro"><p class="nav-intro-title">${esc(group.label)}</p><p class="nav-intro-text">${esc(group.intro)}</p></div>${cols}<div class="nav-feature-slot" data-feature="${group.feature || ''}">${featureHTML(group)}</div></div>`;
  }
  const desktopHTML = (links) => groups.map(g => `<li class="nav-group" data-group="${g.id}"><button type="button" class="nav-trigger" data-nav-trigger="${g.id}" aria-expanded="false" aria-controls="menu-${g.id}">${esc(g.label)}${CARET}</button><div class="nav-panel" id="menu-${g.id}" data-group="${g.id}" hidden>${panelHTML(g, links)}</div></li>`).join('');
  const sheetHTML = (links) => `<a class="sheet-ask" href="/ask"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8.5 9.5h7M8.5 12.5h4"/></svg><span><span class="sheet-ask-title">Ask OPAX</span><span class="sheet-ask-sub">Ask a question of the public record</span></span>${ARROW}</a>`
    + `<section class="sheet-start" aria-labelledby="sheet-start-h"><h2 class="sheet-kicker" id="sheet-start-h">Start here</h2><ul class="sheet-chips" role="list">${shortcuts.filter(links).map(s => s.week
      ? `<li><a class="sheet-chip" data-week href="${esc(week ? week.href : s.href)}">${esc(s.label)}</a></li>`
      : itemHTML(s, () => `<a class="sheet-chip" href="${esc(hrefOf(s))}">${esc(s.label)}</a>`)).join('')}</ul></section>`
    + `<div class="sheet-groups">${groups.map(g => `<section class="sheet-group" data-group="${g.id}"><h2 class="sheet-group-h"><button type="button" class="sheet-group-toggle" aria-expanded="false" aria-controls="sheet-${g.id}"><span class="sheet-group-text"><span class="sheet-group-label">${esc(g.label)}</span><span class="sheet-group-sub">${esc(g.sub)}</span></span>${CARET}</button></h2><div class="sheet-group-body" id="sheet-${g.id}" hidden>${g.columns.map(col => `<p class="sheet-col-h">${esc(col.heading)}</p><ul class="sheet-links" role="list">${col.links.filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'sheet-link')}${esc(l.label)}</a>`)).join('')}${col.section ? `<li><a class="sheet-link sheet-link-all" href="${col.section.href}">${esc(col.more)}</a></li>` : ''}</ul>`).join('')}</div></section>`).join('')}</div>`
    + `<p class="sheet-foot">${footerOnly.map(p => `<a href="${p.href}">${esc(p.label)}</a>`).join('')}</p>`;
  /** The footer's site index. `slot: false` (the build's static copy) leaves
   *  closed gates out entirely instead of drawing a slot for them. */
  const footerHTML = (links = () => true, { slot = true } = {}) => groups.map(g => `<div class="footer-col"><h2 class="footer-col-h">${esc(g.label)}</h2><ul role="list">${g.columns.flatMap(c => c.links).filter(links).map(l => itemHTML(l, () => `${linkHTML(l, 'footer-link')}${esc(l.label)}</a>`, { slot })).join('')}${g.id === 'about' ? footerOnly.map(p => `<li><a class="footer-link" href="${p.href}">${esc(p.label)}</a></li>`).join('') : ''}</ul></div>`).join('');
  /** The menu bar before (or without) scripts: each group as a link to its first page. */
  const barHTML = () => groups.map(g => `<li class="nav-group"><a class="nav-trigger" href="${g.href}">${esc(g.label)}</a></li>`).join('');

  /** Marks the links to this page and the group that holds it. */
  function markCurrent(root = document) {
    const path = location.pathname;
    const group = active(path, new URLSearchParams(location.search));
    for (const t of root.querySelectorAll('[data-nav-trigger]')) t.classList.toggle('is-current', t.dataset.navTrigger === group);
    for (const s of root.querySelectorAll('.sheet-group')) s.classList.toggle('is-current', s.dataset.group === group);
    for (const a of root.querySelectorAll('.nav-item-link, .sheet-link, .footer-link, .sheet-chip')) {
      const base = a.getAttribute('href').split('?')[0];
      // The page itself, or (one step up) the section page it sits under.
      if (base === path) a.setAttribute('aria-current', 'page');
      else if (base !== '/money' && path.startsWith(base + '/')) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }

  // --- the menu bar: disclosure panels ---------------------------------------
  // Each group is a button (aria-expanded, aria-controls) over its panel.
  // Keyboard: Enter or Space toggles; Down opens at the first link; Left and
  // Right walk the bar; Up and Down walk a panel's links (Home, End); Escape
  // closes and returns to the button; tabbing out closes. Hover opens on fine
  // pointers only, and a click right after a hover-open confirms, not closes.
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
    const linksIn = m => [...m.panel.querySelectorAll('a[href]')].filter(a => !a.closest('[hidden]:not(.nav-panel)'));
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
        if (focus) linksIn(m)[0]?.focus();
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
        if (e.key === 'ArrowDown') { e.preventDefault(); set(m, true, { focus: true }); }
        else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const i = menus.indexOf(m) + (e.key === 'ArrowRight' ? 1 : -1);
          const to = menus[(i + menus.length) % menus.length];
          // Read before the focus moves: leaving the item closes its panel.
          const wasOpen = Boolean(open);
          to.btn.focus();
          if (wasOpen) set(to, true);
        }
      });
      m.panel.addEventListener('keydown', (e) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const all = linksIn(m);
        const i = all.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        if (e.key === 'ArrowUp' && i === 0) { m.btn.focus(); return; }
        const to = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : Math.min(all.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
        all[to].focus();
      });
      m.item.addEventListener('mouseenter', () => {
        if (!hoverFine.matches) return;
        clearTimeout(timer);
        if (open === m) return;
        // A short intent delay keeps a pointer crossing the bar from flashing
        // panels; once one is open, moving along the bar swaps at once.
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
    // close button, the backdrop or Escape. Reduced motion closes at once.
    function close() {
      if (!drawer.open || drawer.classList.contains('is-closing')) return;
      if (reduced()) { drawer.close(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; drawer.classList.remove('is-closing'); drawer.close(); };
      drawer.classList.add('is-closing');
      drawer.addEventListener('animationend', (e) => { if (e.target === drawer) finish(); }, { once: true });
      setTimeout(finish, 320); // the animation is 220ms; this is the safety net
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
        .filter(el => !el.closest('[hidden]'));
      if (!stops.length) return;
      const first = stops[0], last = stops[stops.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
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

  /** "/" opens the header search, unless the reader is typing somewhere. */
  function slashOpensSearch(e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.defaultPrevented) return false;
    const t = e.target;
    if (t?.isContentEditable || t?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog[open]')) return false;
    const open = document.getElementById('header-search-open');
    if (!open || !open.getClientRects().length || open.getAttribute('aria-expanded') === 'true') return false;
    e.preventDefault();
    open.click();
    return true;
  }

  // The page's menus are drawn and wired once, however often this script runs.
  const initialised = Symbol.for('opax.navigation.page');
  if (typeof document !== 'undefined' && document[initialised]) return;
  globalThis.OpaxNavigation = { groups, footerOnly, shortcuts, sections, money, active, trail, moneyNav, mountDesktop, mountDrawer, markCurrent, footerHTML, barHTML, FULL_NAV };
  if (typeof document === 'undefined') return;
  document[initialised] = true;
  for (const name of (document.documentElement.dataset.navGates || '').split(/\s+/)) if (name in gates && name !== 'estimates') gates[name] = true;
  // Audit and instrument pages carry no person links (the Worker strips them
  // from the server HTML); the menus drawn here follow the same rule.
  const instrumentPage = /^\/(?:instruments?|audit)(\/|$)/.test(location.pathname);
  const links = link => !(instrumentPage && link.href.startsWith('/subject/person'));
  const desktop = document.querySelector('#primary-nav .nav-list');
  const mobile = document.querySelector('#nav-drawer .sheet-nav');
  const footer = document.getElementById('footer-index');
  if (desktop) desktop.innerHTML = desktopHTML(links);
  if (mobile) mobile.innerHTML = sheetHTML(links);
  if (footer) footer.innerHTML = footerHTML(links);
  markCurrent();
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
    } else {
      for (const li of document.querySelectorAll(`[data-gate-slot="${name}"]`)) {
        li.innerHTML = slots.get(Number(li.dataset.slot))?.() || '';
        li.removeAttribute('data-gate-slot');
        li.hidden = false;
      }
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
  document.addEventListener('keydown', slashOpensSearch);
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
