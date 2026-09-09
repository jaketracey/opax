import { json, lifecycle, coverageHTML, yearChart, contractHTML, mountYearChart } from './suppliers.js?v=austender-1';
import { procurementGraph } from './procurement-data.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => (Number(value) || 0).toLocaleString('en-AU');
const money = value => (Number(value) || 0).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const compact = value => (Number(value) || 0).toLocaleString('en-AU', {style:'currency', currency:'AUD', notation:'compact', maximumFractionDigits:1});
const url = id => `/subject/agency/${encodeURIComponent(id)}`;
const supplierUrl = id => `/subject/supplier/${encodeURIComponent(id)}`;

function busy(root) { root.setAttribute('aria-busy', 'true'); root.innerHTML = '<p class="status" role="status">Opening agency records…</p>'; }
function failed(root, retry) {
  root.removeAttribute('aria-busy');
  root.innerHTML = '<div class="supplier-page" role="alert"><h2>Agency records unavailable</h2><p>The records could not be loaded.</p><button class="supplier-button" type="button">Try again</button></div>';
  root.querySelector('button').addEventListener('click', retry);
}

export async function mountProcurementPreview(root, profile, kind, life) {
  root.hidden = false;
  root.innerHTML = '<p role="status">Opening the 3D map…</p>';
  try {
    const { mountMoneyMap } = await import('/money-map.js?v=agency-2');
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
    busy(root);
    try {
      const data = await json('/agencies.json', life.signal);
      if (!life.alive()) return;
      if (!Array.isArray(data.agencies)) throw new Error('Invalid directory');
      root.removeAttribute('aria-busy');
      root.innerHTML = `<div class="supplier-page agency-directory-page"><div class="subject-head"><h2 id="subject-title" tabindex="-1">Government agencies</h2><p class="subject-tag">Who awards Commonwealth contracts, and which companies receive them.</p></div><div class="supplier-controls"><label>Find an agency<input type="search" name="agency-query" placeholder="Agency name" autocomplete="off"></label><label>Sort by<select name="agency-sort"><option value="total">Contract value</option><option value="count">Number of contracts</option><option value="supplier_count">Number of suppliers</option><option value="name">Name</option></select></label></div><p class="supplier-result-count" role="status"></p><div class="supplier-directory"></div><div class="supplier-more"></div><p class="fineprint">Agency names appear as recorded. Renamed departments are separate entries; no succession or combined history is assumed.</p>${coverageHTML(data.meta)}</div>`;
      const query = root.querySelector('input'), sort = root.querySelector('select');
      query.value = helpers.params?.get('q') || '';
      let visible = 40;
      function render() {
        const term = query.value.trim().toLocaleLowerCase();
        const rows = data.agencies.filter(a => a.name.toLocaleLowerCase().includes(term)).sort((a,b) => sort.value === 'name' ? a.name.localeCompare(b.name) : b[sort.value] - a[sort.value] || a.name.localeCompare(b.name));
        root.querySelector('.supplier-result-count').textContent = `${number(rows.length)} agencies${term ? ' matching your search' : ' in the available records'}`;
        root.querySelector('.supplier-directory').innerHTML = rows.length ? rows.slice(0,visible).map(a => `<a class="supplier-directory-row" href="${url(a.id)}"><span><strong>${esc(a.name)}</strong><small>${number(a.supplier_count)} suppliers</small></span><span class="supplier-directory-value"><strong>${money(a.total)}</strong><small>${number(a.count)} contracts</small></span></a>`).join('') : '<p>No agencies match. Try another name.</p>';
        const more = root.querySelector('.supplier-more');
        more.innerHTML = rows.length > visible ? '<button class="supplier-button" type="button">Show more agencies</button>' : '';
        more.querySelector('button')?.addEventListener('click', () => { const first = visible; visible += 40; render(); root.querySelectorAll('.supplier-directory-row')[first]?.focus(); });
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
    busy(root);
    try {
      const data = await json('/agencies.json', life.signal);
      if (!life.alive()) return;
      const entry = data.agencies.find(a => a.id === idOrName) || data.agencies.find(a => a.name === idOrName);
      if (!entry) {
        root.removeAttribute('aria-busy');
        root.innerHTML = '<div class="supplier-page"><h2 id="subject-title" tabindex="-1">Agency not found</h2><p>Browse the available <a href="/subject/agency">government agencies</a>.</p></div>';
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
 return `<div class="search-sort-picker agency-supplier-sort"><input type="hidden" value="value_desc"><button type="button" class="action-btn search-sort-trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="agency-supplier-sort-menu" aria-label="Sort suppliers: Highest value"><span class="search-sort-label">Highest value</span><svg class="search-sort-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg></button><div id="agency-supplier-sort-menu" class="search-sort-menu" role="menu" aria-label="Sort suppliers" hidden>${SUPPLIER_SORTS.map(([value,label,note])=>`<button type="button" role="menuitemradio" aria-checked="${value==='value_desc'}" data-value="${value}" tabindex="-1"><span><strong>${label}</strong><small>${note}</small></span><span class="search-sort-check" aria-hidden="true">✓</span></button>`).join('')}<p>Applies to all matching suppliers.</p></div></div>`;
}

function renderProfile(root, profile, meta, helpers, life) {
  const top = profile.suppliers[0];
  root.removeAttribute('aria-busy');
  root.innerHTML = `<div class="supplier-page"><div class="subject-head"><h2 id="subject-title" tabindex="-1">${esc(profile.name)}</h2><p class="subject-tag">Commonwealth awarding agency</p></div><p class="supplier-lede">${top ? `<a href="${supplierUrl(top.id)}">${esc(top.name)}</a> has the largest recorded contract value with this agency.` : 'No suppliers are recorded.'}</p><dl class="supplier-totals"><div><dt>Recorded contract value</dt><dd title="${money(profile.total)}">${compact(profile.total)}</dd></div><div><dt>Contracts</dt><dd>${number(profile.count)}</dd></div><div><dt>Suppliers</dt><dd>${number(profile.suppliers.length)}</dd></div></dl><div class="supplier-profile-grid"><div class="supplier-profile-main"><section class="supplier-section"><h3 class="subject-section-title">Agency and company connections</h3><p class="supplier-section-note">The 3D map shows the largest ${Math.min(60, profile.suppliers.filter(s => s.total > 0).length)} supplier relationships with positive recorded value. Select a company or connection to explore it. All suppliers are listed below.</p><div class="supplier-money-map agency-map"></div></section><section class="supplier-section"><h3 class="subject-section-title">Who receives the contracts</h3><div class="supplier-controls agency-supplier-controls"><label>Find a supplier<input name="agency-supplier-query" type="search" placeholder="Name or ABN" autocomplete="off"></label>${supplierSortHTML()}</div><p class="agency-supplier-count" role="status"></p><div class="agency-suppliers supplier-directory"></div><div class="agency-suppliers-more"></div></section>${yearChart(profile.years, profile.undated)}<section class="supplier-section"><h3 class="subject-section-title">The contract record</h3><div class="supplier-controls"><label>Filter contracts<input name="agency-contract-query" type="search" placeholder="Title, supplier or reference" autocomplete="off"></label></div><p class="supplier-contract-count" role="status"></p><div class="supplier-contract-list"></div><div class="supplier-contract-more"></div></section></div><aside class="supplier-context"><section><h3>Follow the connections</h3><p>Open a supplier to see its other awarding agencies and any recorded donor links.</p><a href="/search?kind=speech&q=${encodeURIComponent(`"${profile.name}"`)}">Find mentions in parliament</a><a class="supplier-directory-link" href="/subject/agency">Browse all agencies</a><a class="supplier-directory-link" href="/subject/supplier">Browse all suppliers</a></section><section><h3>About these records</h3><p class="fineprint">This is the agency name recorded in the source. Renamed departments remain separate entries. Supplier links do not establish that donations influenced contract awards.</p>${coverageHTML(meta)}</section></aside></div></div>`;
  let suppliersVisible = 20, contractsVisible = 15;
  const supplierQuery = root.querySelector('[name="agency-supplier-query"]');
  const contractQuery = root.querySelector('[name="agency-contract-query"]');
  const supplierSort = root.querySelector('.agency-supplier-sort input');
  supplierSort.value = 'value_desc';
  const picker = helpers.mountSort?.(root.querySelector('.agency-supplier-sort'), () => { suppliersVisible = 20; suppliers(); });
  if (picker) life.cleanup(() => picker.destroy());
  function suppliers() {
    const q = supplierQuery.value.trim().toLocaleLowerCase();
    const rows = sortAgencySuppliers(profile.suppliers.filter(s => `${s.name} ${s.abn || ''}`.toLocaleLowerCase().includes(q)), supplierSort.value);
    root.querySelector('.agency-supplier-count').textContent = `${number(rows.length)} suppliers${q ? ' matching this filter' : ''}`;
    root.querySelector('.agency-suppliers').innerHTML = rows.length ? rows.slice(0,suppliersVisible).map(s => `<div class="supplier-directory-row"><span><a href="${supplierUrl(s.id)}"><strong>${esc(s.name)}</strong></a><small>${s.abn ? `ABN ${esc(s.abn)}` : 'No ABN recorded'}</small>${s.donor_links.length ? `<small>${s.donor_links.filter(l => /^\/subject\/donor\//.test(l.url)).map(l => `<a href="${esc(l.url)}">Recorded donor profile</a>`).join(' · ')}</small>` : ''}</span><span class="supplier-directory-value"><strong>${money(s.total)}</strong><small>${number(s.count)} ${s.count === 1 ? 'contract' : 'contracts'}</small></span></div>`).join('') : '<p>No suppliers match this filter.</p>';
    const more = root.querySelector('.agency-suppliers-more'); more.innerHTML = rows.length > suppliersVisible ? '<button type="button" class="supplier-button">Show more suppliers</button>' : '';
    more.querySelector('button')?.addEventListener('click', () => { const first = suppliersVisible; suppliersVisible += 20; suppliers(); root.querySelectorAll('.agency-suppliers .supplier-directory-row')[first]?.querySelector('a')?.focus(); });
  }
  function contracts() {
    const q = contractQuery.value.trim().toLocaleLowerCase();
    const rows = profile.contracts.filter(c => `${c.title} ${c.supplier} ${c.id}`.toLocaleLowerCase().includes(q));
    root.querySelector('.supplier-contract-count').textContent = `${number(Math.min(contractsVisible,rows.length))} of ${number(rows.length)} contracts${q ? ' matching this filter' : ', newest first'}`;
    root.querySelector('.supplier-contract-list').innerHTML = rows.length ? rows.slice(0,contractsVisible).map(contractHTML).join('') : '<p>No contracts match this filter.</p>';
    const more = root.querySelector('.supplier-contract-more'); more.innerHTML = rows.length > contractsVisible ? '<button type="button" class="supplier-button">Show more contracts</button>' : '';
    more.querySelector('button')?.addEventListener('click', () => { const first = contractsVisible; contractsVisible += 15; contracts(); root.querySelectorAll('.supplier-contract summary')[first]?.focus(); });
  }
  supplierQuery.addEventListener('input', () => { suppliersVisible = 20; suppliers(); });
  contractQuery.addEventListener('input', () => { contractsVisible = 15; contracts(); });
  mountYearChart(root, life);
  suppliers(); contracts(); helpers.onCanonical?.(profile.id, profile.name); helpers.onTitle?.(`${profile.name} · Government agency`);
  mountProcurementPreview(root.querySelector('.agency-map'), profile, 'agency', life).catch(() => {});
}
