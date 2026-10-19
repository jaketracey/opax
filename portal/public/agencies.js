import {donorLabelHTML} from './donor-disclosure.js?v=800932e746';
import { json, lifecycle, coverageHTML, yearChart, contractHTML, mountYearChart, placeholderContract, plural, procurementSourceHTML, procurementRailHTML, slowNotice, statsHTML } from './suppliers.js?v=087705703f';
import { procurementGraph } from './procurement-data.js';
import { shortMoney } from './format.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => (Number(value) || 0).toLocaleString('en-AU');
const money = value => (Number(value) || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const compact = shortMoney;
const url = id => `/subject/agency/${encodeURIComponent(id)}`;
const supplierUrl = id => `/subject/supplier/${encodeURIComponent(id)}`;

/** A list this short needs no filter or sort. */
const TOOLS_FROM = 6;
function busy(root, life) {
  root.setAttribute('aria-busy', 'true');
  root.innerHTML = '<div class="supplier-page"><p class="ui-status-line" role="status">Opening agency records…</p></div>';
  slowNotice(root, life, 'Still opening the agency records. Large agencies take longer to load.');
}
function failed(root, retry) {
  root.removeAttribute('aria-busy');
  root.innerHTML = '<div class="supplier-page" role="alert"><div class="ui-page-head"><h1>Agency records unavailable</h1></div><p class="ui-empty" data-variant="error">The records could not be loaded.</p><p class="ui-actions"><button class="ui-button" type="button">Try again</button></p></div>';
  root.querySelector('button').addEventListener('click', retry);
}

export async function mountProcurementPreview(root, profile, kind, life) {
  root.hidden = false;
  root.innerHTML = '<p role="status">Opening the 3D map…</p>';
  try {
    const { mountMoneyMap } = await import('/money-map.js?v=12b9796e7c');
    if (!life.alive()) return;
    const graph = procurementGraph(profile, kind);
    if (!graph.edges.length) { root.innerHTML = '<p>No relationships with positive recorded contract value are available for the map.</p>'; return; }
    root.textContent = '';
    const handle = await mountMoneyMap(root, graph, { subject: `${kind}:${profile.id}`, chrome: 'mini', reveal: false, openCard: false });
    if (!life.alive()) { handle.destroy(); return; }
    life.cleanup(() => handle.destroy());
    handle.fit(false);
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => handle.setPaused(!entries.at(-1).isIntersecting));
      observer.observe(root); life.cleanup(() => observer.disconnect());
    }
    return handle;
  } catch (error) {
    if (life.alive()) root.innerHTML = '<p>The map could not open. The same relationships are listed below.</p>';
    throw error;
  }
}

export function mountAgencyDirectory(root, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    busy(root, life);
    try {
      const data = await json('/agencies.json', life.signal);
      if (!life.alive()) return;
      if (!Array.isArray(data.agencies)) throw new Error('Invalid directory');
      root.removeAttribute('aria-busy');
      root.innerHTML = `<div class="supplier-page agency-directory-page"><div class="ui-page-head"><h1 id="subject-title" tabindex="-1">Government agencies</h1><p class="ui-lede">Who awards Commonwealth contracts, and which companies receive them.</p></div><div class="ui-toolbar agency-directory-controls"><label class="ui-field">Find an agency<input class="ui-input" type="search" name="agency-query" placeholder="Agency name" autocomplete="off"></label><label class="ui-field">Sort by<select class="ui-input" name="agency-sort"><option value="total">Contract value</option><option value="count">Number of contracts</option><option value="supplier_count">Number of suppliers</option><option value="name">Name</option></select></label></div><p class="ui-filter-count agency-directory-count" role="status"></p><ul class="ui-list agency-directory agency-rows" role="list"></ul><div class="ui-actions agency-directory-more"></div><p class="fineprint">Agency names appear as recorded. Renamed departments are separate entries; no succession or combined history is assumed.</p>${coverageHTML(data.meta)}</div>`;
      const query = root.querySelector('input'), sort = root.querySelector('select');
      query.value = helpers.params?.get('q') || '';
      let visible = 40;
      function render() {
        const term = query.value.trim().toLocaleLowerCase();
        const rows = data.agencies.filter(a => a.name.toLocaleLowerCase().includes(term)).sort((a,b) => sort.value === 'name' ? a.name.localeCompare(b.name) : b[sort.value] - a[sort.value] || a.name.localeCompare(b.name));
        root.querySelector('.agency-directory-count').textContent = `${plural(rows.length, 'agency', 'agencies')}${term ? ' matching your search' : ' in the available records'}`;
        root.querySelector('.agency-directory').innerHTML = rows.length ? rows.slice(0,visible).map(a => `<li class="ui-row"><div><p class="ui-row-name"><a href="${url(a.id)}">${esc(a.name)}</a></p><p class="ui-row-meta">${plural(a.supplier_count, 'supplier')}</p></div><div class="ui-row-figure">${money(a.total)}<span class="ui-row-meta">${plural(a.count, 'contract')}</span></div></li>`).join('') : '<li class="ui-empty">No agencies match. Try another name.</li>';
        const more = root.querySelector('.agency-directory-more');
        more.innerHTML = rows.length > visible ? '<button class="ui-button" type="button">Show more agencies</button>' : '';
        more.querySelector('button')?.addEventListener('click', () => { const first = visible; visible += 40; render(); root.querySelectorAll('.agency-directory > li')[first]?.querySelector('a')?.focus(); });
      }
      query.addEventListener('input', () => { visible = 40; const params = new URLSearchParams(); if (query.value.trim()) params.set('q', query.value.trim()); history.replaceState(null, '', `/subject/agency${params.size ? `?${params}` : ''}`); render(); });
      sort.addEventListener('change', () => { visible = 40; render(); });
      render(); helpers.onTitle?.('Government agencies');
    } catch { if (life.alive()) failed(root, load); }
  }
  load(); return { destroy: life.destroy };
}

export function mountAgencyProfile(root, idOrName, helpers = {}) {
  const life = lifecycle(root);
  async function load() {
    busy(root, life);
    try {
      const data = await json('/agencies.json', life.signal);
      if (!life.alive()) return;
      const entry = data.agencies.find(a => a.id === idOrName) || data.agencies.find(a => a.name === idOrName);
      if (!entry) {
        root.removeAttribute('aria-busy');
        root.innerHTML = '<div class="supplier-page"><div class="ui-page-head"><h1 id="subject-title" tabindex="-1">Agency not found</h1><p class="ui-lede">Browse the available <a href="/subject/agency">government agencies</a>.</p></div></div>';
        helpers.onTitle?.('Agency not found'); return;
      }
      if (!/^\/agencies\/a-[a-f0-9]{20}\.json$/.test(entry.profile_path)) throw new Error('Invalid profile path');
      const profile = await json(entry.profile_path, life.signal);
      if (!life.alive()) return;
      if (profile.id !== entry.id || !Array.isArray(profile.contracts) || !Array.isArray(profile.suppliers)) throw new Error('Invalid profile');
      renderProfile(root, profile, data.meta, helpers, life);
    } catch { if (life.alive()) failed(root, load); }
  }
  load(); return { destroy: life.destroy };
}

const SUPPLIER_SORTS = [
 ['value_desc','Highest value','Largest contract value first'],
 ['value_asc','Lowest value','Smallest contract value first'],
 ['count_desc','Most contracts','Largest number of contracts first'],
 ['count_asc','Fewest contracts','Smallest number of contracts first'],
 ['name_asc','Name A–Z','Alphabetical by supplier name'],
 ['name_desc','Name Z–A','Reverse alphabetical order'],
];
export function sortAgencySuppliers(rows, sort) {
 const name = (a,b) => a.name.localeCompare(b.name,'en-AU',{sensitivity:'base',numeric:true}) || a.id.localeCompare(b.id);
 const compare = sort==='value_asc' ? (a,b)=>a.total-b.total : sort==='count_desc' ? (a,b)=>b.count-a.count : sort==='count_asc' ? (a,b)=>a.count-b.count : sort==='name_desc' ? (a,b)=>-name(a,b) : sort==='name_asc' ? name : (a,b)=>b.total-a.total;
 return [...rows].sort((a,b)=>compare(a,b)||name(a,b));
}
function supplierSortHTML() {
 return `<div class="search-sort-picker agency-supplier-sort"><input type="hidden" value="value_desc"><button type="button" class="ui-button search-sort-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="agency-supplier-sort-menu" aria-label="Sort suppliers: Highest value"><span class="search-sort-label">Highest value</span><svg class="search-sort-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button><div id="agency-supplier-sort-menu" class="search-sort-menu" role="menu" aria-label="Sort suppliers" hidden>${SUPPLIER_SORTS.map(([value,label,note])=>`<button type="button" role="menuitemradio" aria-checked="${value==='value_desc'}" data-value="${value}" tabindex="-1"><span><strong>${label}</strong><small>${note}</small></span><span class="search-sort-check" aria-hidden="true">✓</span></button>`).join('')}<p>Applies to all matching suppliers.</p></div></div>`;
}

function renderProfile(root, profile, meta, helpers, life) {
  const top = profile.suppliers[0];
  const mapped = Math.min(60, profile.suppliers.filter(s => s.total > 0).length);
  const listed = profile.contracts.filter(c => !placeholderContract(c)).length;
  const supplierTools = profile.suppliers.length >= TOOLS_FROM, contractTools = listed >= TOOLS_FROM;
  // Sections exist only with records in them; the rail lists what is on the page.
  const sections = [
    mapped ? ['agency-connections', 'Agency and company connections'] : null, ['agency-suppliers', 'Who receives the contracts'],
    profile.years?.length ? ['procurement-years', 'Contract value over time'] : null, ['agency-contracts', 'The contract record'],
  ].filter(Boolean);
  root.removeAttribute('aria-busy');
  root.innerHTML = `<div class="supplier-page agency-page"><div class="ui-page-head supplier-head"><h1 id="subject-title" tabindex="-1">${esc(profile.name)}</h1><p class="ui-page-meta">Commonwealth awarding agency</p><p class="ui-lede supplier-lede">${top ? `<a href="${supplierUrl(top.id)}">${esc(top.name)}</a> has the largest recorded contract value with this agency.` : 'No suppliers are recorded.'}</p>${statsHTML([[compact(profile.total), 'Recorded contract value', money(profile.total)], [number(profile.count), 'Contracts'], [number(profile.suppliers.length), 'Suppliers']])}</div><div class="supplier-profile-grid"><div class="supplier-profile-main">${mapped ? `<section class="ui-section supplier-section" id="agency-connections"><h2 class="ui-section-title">Agency and company connections</h2><p class="ui-section-note supplier-section-note">${mapped === 1 ? 'The 3D map shows the one supplier relationship with positive recorded value.' : `The 3D map shows the largest ${mapped} supplier relationships with positive recorded value.`} Select a company or connection to explore it. All suppliers are listed below.</p><div class="supplier-money-map agency-map"></div></section>` : ''}<section class="ui-section supplier-section" id="agency-suppliers"><h2 class="ui-section-title">Who receives the contracts</h2>${supplierTools ? `<div class="ui-toolbar agency-supplier-controls"><label class="ui-field">Find a supplier<input class="ui-input" name="agency-supplier-query" type="search" placeholder="Name or ABN" autocomplete="off"></label>${supplierSortHTML()}</div>` : ''}<p class="ui-filter-count agency-supplier-count" role="status"></p><ul class="ui-list agency-suppliers agency-rows" role="list"></ul><div class="ui-actions agency-suppliers-more"></div>${procurementSourceHTML(meta, ['This is the agency name recorded in the source. Renamed departments remain separate entries.', 'A link to a donor profile records a matching name or ABN. It does not establish that donations influenced contract awards.'])}</section>${yearChart(profile.years || [], profile.undated)}<section class="ui-section supplier-section" id="agency-contracts"><h2 class="ui-section-title">The contract record</h2>${contractTools ? '<div class="ui-toolbar agency-contract-controls"><label class="ui-field">Filter contracts<input class="ui-input" name="agency-contract-query" type="search" placeholder="Title, supplier or reference" autocomplete="off"></label></div>' : ''}<p class="ui-filter-count supplier-contract-count" role="status"></p><div class="supplier-contract-list"></div><div class="ui-actions supplier-contract-more"></div>${procurementSourceHTML(meta)}</section></div>${procurementRailHTML(sections, [
    [`/ask?view=search&kind=speech&q=${encodeURIComponent(`"${profile.name}"`)}`, 'Find mentions in parliament'], ['/subject/agency', 'Browse all agencies'], ['/subject/supplier', 'Browse all suppliers'],
  ])}</div></div>`;
  let suppliersVisible = 20, contractsVisible = 15;
  const supplierQuery = root.querySelector('[name="agency-supplier-query"]');
  const contractQuery = root.querySelector('[name="agency-contract-query"]');
  const supplierSort = root.querySelector('.agency-supplier-sort input');
  if (supplierSort) {
    supplierSort.value = 'value_desc';
    const picker = helpers.mountSort?.(root.querySelector('.agency-supplier-sort'), () => { suppliersVisible = 20; suppliers(); });
    if (picker) life.cleanup(() => picker.destroy());
  }
  function suppliers() {
    const q = (supplierQuery?.value || '').trim().toLocaleLowerCase();
    const rows = sortAgencySuppliers(profile.suppliers.filter(s => `${s.name} ${s.abn || ''}`.toLocaleLowerCase().includes(q)), supplierSort?.value || 'value_desc');
    root.querySelector('.agency-supplier-count').textContent = `${plural(rows.length, 'supplier')}${q ? ' matching this filter' : ''}`;
    root.querySelector('.agency-suppliers').innerHTML = rows.length ? rows.slice(0,suppliersVisible).map(s => `<li class="ui-row"><div><p class="ui-row-name"><a href="${supplierUrl(s.id)}">${esc(s.name)}</a></p><p class="ui-row-meta">${s.abn ? `ABN ${esc(s.abn)}` : 'No ABN recorded'}</p>${s.donor_links.length ? `<p class="ui-row-meta">${s.donor_links.map(l => donorLabelHTML(l)).join(' · ')}</p>` : ''}</div><div class="ui-row-figure">${money(s.total)}<span class="ui-row-meta">${plural(s.count, 'contract')}</span></div></li>`).join('') : '<li class="ui-empty">No suppliers match this filter.</li>';
    const more = root.querySelector('.agency-suppliers-more'); more.innerHTML = rows.length > suppliersVisible ? '<button type="button" class="ui-button">Show more suppliers</button>' : '';
    more.querySelector('button')?.addEventListener('click', () => { const first = suppliersVisible; suppliersVisible += 20; suppliers(); root.querySelectorAll('.agency-suppliers > li')[first]?.querySelector('a')?.focus(); });
  }
  function contracts() {
    const q = (contractQuery?.value || '').trim().toLocaleLowerCase();
    const rows = profile.contracts.filter(c => !placeholderContract(c) && `${c.title} ${c.description || ''} ${c.supplier} ${c.id}`.toLocaleLowerCase().includes(q));
    const placeholders = profile.contracts.filter(placeholderContract).length;
    root.querySelector('.supplier-contract-count').textContent = `${number(Math.min(contractsVisible,rows.length))} of ${plural(rows.length, 'contract')}${q ? ' matching this filter' : ', newest first'}${placeholders && !q ? ` · ${number(placeholders)} undated $0 ${placeholders === 1 ? 'record' : 'records'} not shown` : ''}`;
    root.querySelector('.supplier-contract-list').innerHTML = rows.length ? rows.slice(0,contractsVisible).map(c => contractHTML(c)).join('') : `<p class="ui-empty">${q ? 'No contracts match this filter.' : 'No dated contracts are recorded.'}</p>`;
    const more = root.querySelector('.supplier-contract-more'); more.innerHTML = rows.length > contractsVisible ? '<button type="button" class="ui-button">Show more contracts</button>' : '';
    more.querySelector('button')?.addEventListener('click', () => { const first = contractsVisible; contractsVisible += 15; contracts(); root.querySelectorAll('.supplier-contract summary')[first]?.focus(); });
  }
  supplierQuery?.addEventListener('input', () => { suppliersVisible = 20; suppliers(); });
  contractQuery?.addEventListener('input', () => { contractsVisible = 15; contracts(); });
  mountYearChart(root, life);
  suppliers(); contracts(); helpers.onCanonical?.(profile.id, profile.name); helpers.onTitle?.(`${profile.name} · Government agency`);
  if (mapped) mountProcurementPreview(root.querySelector('.agency-map'), profile, 'agency', life).catch(() => {});
}
