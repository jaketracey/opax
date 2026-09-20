/* One information architecture for desktop and mobile. Loaded before app.js. */
(() => {
  const sections = [
    { id: 'research', label: 'Ask & search', href: '/ask' },
    { id: 'topics', label: 'Topics', href: '/subject/topic' },
    { id: 'people', label: 'People & organisations', children: [
      ['/subject/person', 'Parliamentarians', 'Speeches, recorded votes and declared interests.'],
      ['/subject/electorate', 'Electorates', 'Representatives, election timelines and Census context.'],
      ['/subject/party', 'Parties', 'Members, debate and disclosed receipts.'],
      ['/subject/donor', 'Donors', 'The people and organisations in disclosure records.'],
      ['/subject/agency', 'Agencies', 'Government contract awards and the companies receiving them.'],
      ['/subject/supplier', 'Suppliers', 'Government contracts and the organisations receiving them.'],
      ['/subject/campaigner', 'Campaigners & third parties', 'Organisations spending on politics.'],
      ['/declared', 'Declared interests', 'Recent changes in public registers.'],
    ] },
    { id: 'money', label: 'Money', href: '/money' },
    { id: 'bills', label: 'Bills', href: '/bills' },
    { id: 'reports', label: 'Reports', children: [
      ['/reports', 'All reports', 'Sourced reading paths through the record.'],
      ['/reports/grants-allocation', 'Where community funding goes', 'Grant invitations, awards and seat competitiveness.'],
      ['/reports/climate', 'Climate & energy', 'Targets, coal and renewables.'],
      ['/reports/gambling', 'Gambling', 'Pokies, wagering and reform.'],
      ['/reports/housing', 'Housing', 'Affordability, tax and supply.'],
      ['/reports/immigration', 'Immigration', 'Borders, detention and migration.'],
      ['/reports/indigenous', 'First Nations', 'The Voice, treaty and native title.'],
      ['/reports/media', 'Media ownership', 'Press, platforms and ownership.'],
    ] },
    { id: 'about', label: 'About', children: [
      ['/community', 'Community', 'Share reading lists and explore the record together.'],
      ['/about', 'About Opax', 'Independent, open-source parliamentary research.'],
      ['/methods', 'Methods & how to cite', 'Sources, limitations and citation formats.'],
      ['/stats', 'Sources & coverage', 'What is available in the record.'],
      ['/expenses', 'Expense definitions', 'How to read expenditure categories.'],
      ['/explore', 'Interactive tools', 'Compare debates, travel through time and try the record quiz.'],
    ] },
  ];
  const money = [ ['/money', '3D connections'], ['/money/receipts', 'Political receipts'], ['/discover', 'Government contracts'], ['/money/grants', 'Grants'], ['/connections', 'Programs & places'] ];
  const active = (path, params = new URLSearchParams()) => {
    if (/^\/(money|map|discover|connections)(\/|$)/.test(path)) return 'money';
    if (path.startsWith('/subject/topic')) return 'topics';
    if (/^\/(subject|declared)(\/|$)/.test(path)) return 'people';
    if (/^\/bills?(\/|$)/.test(path)) return 'bills';
    if (path.startsWith('/reports')) return 'reports';
    if (path === '/explore') return ['ledger','grants','wd'].includes(params.get('game')) ? 'money' : 'topics';
    if (/^\/(about|methods|stats|expenses)/.test(path)) return 'about';
    return 'research';
  };
  const esc = s => String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  // Contracts and the connections directory are not split by jurisdiction.
  const oneJurisdiction = new Set(['/discover', '/connections']);
  function moneyNav(path, jur) {
    jur = jur || /^\/money\/grants\/(federal|qld)\/recipient\//.exec(path)?.[1];
    return `<nav class="area-nav money-area-nav" aria-label="Money">${money.map(([href,label]) => `<a href="${href}${jur && jur !== 'federal' && !oneJurisdiction.has(href) ? '?jur='+encodeURIComponent(jur) : ''}"${href===path || href==='/money/grants' && path.startsWith('/money/grants/')?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  }
  function mountDrawer({ navigate = href => location.assign(href) } = {}) {
    const $ = id => document.getElementById(id);
    if (!$("nav-drawer") || !$("nav-open")) return { close() {} };
    // The drawer is a modal <dialog>: native focus trap, Esc-close, and focus
    // restored to the hamburger when it closes.
    // Closing animates the panel out before the dialog actually closes; every
    // close path goes through here so the motion is the same from a link, the X,
    // the backdrop or Escape.
    function close() {
      const drawer = $("nav-drawer");
      if (!drawer?.open || drawer.classList.contains("is-closing")) return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) { drawer.close(); return; }
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        drawer.classList.remove("is-closing");
        drawer.close();
      };
      drawer.classList.add("is-closing");
      drawer.addEventListener("animationend", (e) => { if (e.target === drawer) finish(); }, { once: true });
      setTimeout(finish, 300); // the animation is 220ms; this is the safety net
    }
    {
      const drawer = $("nav-drawer");
      const toggle = $("nav-open");
      const searchToggle = $("nav-search-open");
      let opener = toggle;
      searchToggle?.addEventListener("click", () => {
        opener = searchToggle;
        drawer.showModal();
        $("drawer-q").focus({ preventScroll: true });
        toggle.setAttribute("aria-expanded", "true");
        searchToggle?.setAttribute("aria-expanded", "true");
      });
      toggle.addEventListener("click", () => {
        opener = toggle;
        drawer.showModal();
        // The dialog itself takes focus, so a tap on the hamburger does not land
        // a focus ring on the first control; Tab still reaches everything.
        drawer.focus({ preventScroll: true });
        toggle.setAttribute("aria-expanded", "true");
        searchToggle?.setAttribute("aria-expanded", "true");
      });
      drawer.addEventListener("close", () => {
        if (!matchMedia("(min-width: 801px)").matches) opener.focus({ preventScroll: true });
        toggle.setAttribute("aria-expanded", "false");
        searchToggle?.setAttribute("aria-expanded", "false");
      });
      // Escape: run the same exit animation instead of the instant native close.
      drawer.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
      $("drawer-close").addEventListener("click", () => close());
      // A search typed into the drawer lands on the Search page with the query.
      $("drawer-search").addEventListener("submit", (e) => {
        e.preventDefault();
        const q = $("drawer-q").value.trim();
        if (!q) return;
        close();
        $("drawer-q").value = "";
        $("drawer-sugg").hidden = true;
        navigate(`/ask?view=search&q=${encodeURIComponent(q)}`);
      });
      drawer.addEventListener("click", (e) => {
        // A link tap navigates (the hash does the routing) and dismisses the drawer.
        if (e.target.closest("a")) { close(); return; }
        const r = drawer.getBoundingClientRect(); // outside the panel = backdrop
        const inside = e.clientX >= r.left && e.clientX <= r.right &&
                       e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) close();
      });
      // Growing past the mobile breakpoint with the drawer open would strand a
      // modal over a page that now shows the full nav.
      window.matchMedia("(min-width: 801px)").addEventListener("change", (e) => {
        if (e.matches && drawer.open) drawer.close();
      });
    }

    return { close };
  }
  globalThis.OpaxNavigation = { sections, money, active, moneyNav, mountDrawer };
  if (typeof document === 'undefined') return;
  const desktop = document.querySelector('#primary-nav .nav-list');
  const mobile = document.querySelector('#nav-drawer nav');
  if (desktop) desktop.innerHTML = sections.map(s => s.children ? `<li class="nav-item has-menu"><button type="button" class="nav-link" data-panel="${s.id}" aria-expanded="false" aria-controls="menu-${s.id}">${esc(s.label)}<svg class="nav-caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button><div class="megamenu megamenu-wide" id="menu-${s.id}" hidden><div class="mm-grid"${s.id==='reports'?' id="menu-reports-list"':''}>${s.children.map(([href,label,desc])=>`<a class="mm-link" href="${href}"><span class="mm-title">${esc(label)}</span><span class="mm-blurb">${esc(desc)}</span></a>`).join('')}</div>${s.id==='reports'?'<a class="mm-all" href="/reports">All reports</a>':''}</div></li>` : `<li class="nav-item"><a class="nav-link" data-panel="${s.id}" href="${s.href}">${esc(s.label)}</a></li>`).join('');
  if (mobile) mobile.innerHTML = sections.map(s => s.children ? `<details class="drawer-group" id="drawer-group-${s.id}"><summary class="drawer-section">${esc(s.label)}</summary><ul class="drawer-list">${s.children.map(([href,label])=>`<li><a class="drawer-link" data-panel="${s.id}" href="${href}">${esc(label)}</a></li>`).join('')}</ul></details>` : `<a class="drawer-link drawer-primary" data-panel="${s.id}" href="${s.href}">${esc(s.label)}</a>`).join('');
  for (const node of document.querySelectorAll('[data-money-navigation]')) node.innerHTML = moneyNav(location.pathname, new URLSearchParams(location.search).get('jur'));
})();
