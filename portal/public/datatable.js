// Shared, dependency-free table renderer and query engine. Safe to import in a Worker.
import {isOrganisationDonor, withheldPhrases, namesWithheldPhrase, foldDonorName} from './donor-entity.js?v=2b8d45a50d';
import {shortDate} from './format.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const numeric = column => ['money', 'count', 'year'].includes(column.type);
const sortable = column => column.sortable ?? column.type !== 'category';
const integer = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const collator = new Intl.Collator('en-AU', {numeric:true, sensitivity:'base'});
const decimal = new Intl.NumberFormat('en-AU', {maximumFractionDigits:20});
const money = new Intl.NumberFormat('en-AU', {style:'currency', currency:'AUD', minimumFractionDigits:2, maximumFractionDigits:20});
const text = value => String(value ?? '');
const prefix = key => key ? `${key}.` : '';
const own = (object, key) => Object.hasOwn(object, key);

function compact(value, currency) {
  for (const [scale, suffix] of [[1e12,'tn'], [1e9,'bn'], [1e6,'m'], [1e3,'k']]) {
    if (Math.abs(value) >= scale) return `${value < 0 ? '−' : ''}${currency ? '$' : ''}${(Math.round(Math.abs(value) / (scale / 10)) / 10).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return currency ? money.format(value) : decimal.format(value);
}

/** Plain display text; rendering escapes it, CSV always uses the underlying value. */
export function formatCell(value, column) {
  if (value == null || value === '') return '';
  if (numeric(column)) {
    const n = number(value);
    if (n == null) return '';
    if (column.type === 'year') return String(n);
    if (column.type === 'money') return column.format === 'exact' ? money.format(n) : compact(n, true);
    return column.format === 'compact' ? compact(n, false) : decimal.format(n);
  }
  if (column.type === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : shortDate(date.toISOString());
  }
  return text(value);
}

// Donor adapters accept graph nodes, nested donor nodes or flattened endpoint rows.
function donorNode(row) {
  if (row.donor && typeof row.donor === 'object') return row.donor;
  return {label: row.donorName ?? row.donor_name ?? row.donor ?? row.label ?? row.name, aliases:row.aliases};
}
const publicRows = (rows, config) => config.privacy === 'donors' ? rows.filter(row => isOrganisationDonor(donorNode(row))) : rows;
const donorColumn = column => /^(?:donor(?:_?name)?|label|name)$/i.test(column.key) || column.primary;

function cleanQuery(query = {}, config, page) {
  const out = parseQuery(new URLSearchParams(serializeQuery(query)));
  if (!config) return out;
  if (out.sort && !config.columns.some(c => c.key === out.sort.key && sortable(c))) delete out.sort;
  if (out.filters) for (const key of Object.keys(out.filters)) if (!config.columns.some(c => c.key === key)) delete out.filters[key];
  if (config.privacy === 'donors') {
    const nodes = (config.rows || []).map(donorNode).map(node => ({...node, kind:'donor'}));
    const phrases = withheldPhrases([{nodes}], []);
    const withheld = new Set(nodes.filter(n=>!isOrganisationDonor(n)).flatMap(n=>[n.label,...(n.aliases || [])]).map(foldDonorName));
    // The endpoint owns the full privacy index. Server search text is echoed
    // only when public results substantiate it, including organisation aliases.
    const approved = publicRows(page?.rows || [], config);
    if (out.q && (withheld.has(foldDonorName(out.q)) || namesWithheldPhrase(phrases, out.q) || (!config.rows && !approved.some(row=>config.columns.some(c=>foldDonorName(row[c.key]).includes(foldDonorName(out.q))))))) delete out.q;
    if (out.filters) for (const [key, value] of Object.entries(out.filters)) {
      if (Array.isArray(value)) {
        const column = config.columns.find(c => c.key === key);
        const options = Array.isArray(page?.facets?.[key]) ? page.facets[key].map(f=>f.value) : approved.map(row=>text(row[key]));
        const safe = value.filter(v => !withheld.has(foldDonorName(v)) && !namesWithheldPhrase(phrases, v) && (!donorColumn(column) || isOrganisationDonor({label:v})) && (config.rows || options.includes(v)));
        if (safe.length) out.filters[key] = safe; else delete out.filters[key];
      }
    }
  }
  if (out.filters && !Object.keys(out.filters).length) delete out.filters;
  return out;
}

export function parseQuery(params, urlKey) {
  const base = prefix(urlKey), query = {}, filters = Object.create(null);
  const q = params.get(`${base}q`)?.trim();
  if (q) query.q = q;
  for (const [key, value] of params) {
    if (!key.startsWith(`${base}f.`)) continue;
    const name = key.slice(base.length + 2);
    if (!name || ['__proto__','constructor','prototype'].includes(name)) continue;
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const values = [...new Set(parsed.filter(v => typeof v === 'string' && v !== ''))];
        if (values.length) filters[name] = values;
      } else if (parsed && typeof parsed === 'object') {
        const range = {};
        for (const bound of ['min','max']) if (typeof parsed[bound] === 'number' && Number.isFinite(parsed[bound])) range[bound] = parsed[bound];
        if (Object.keys(range).length) filters[name] = range;
      }
    } catch { /* Malformed URL state is ignored. */ }
  }
  if (Object.keys(filters).length) query.filters = {...filters};
  const sort = params.get(`${base}sort`);
  if (sort) {
    const at = sort.lastIndexOf(':');
    if (at > 0 && ['asc','desc'].includes(sort.slice(at + 1))) query.sort = {key:sort.slice(0, at), dir:sort.slice(at + 1)};
  }
  const page = integer(params.get(`${base}page`), 1);
  if (page > 1) query.page = page;
  const pageSize = integer(params.get(`${base}pageSize`), null);
  if (pageSize) query.pageSize = pageSize;
  return query;
}

export function serializeQuery(query = {}, urlKey) {
  const params = new URLSearchParams(), base = prefix(urlKey);
  if (typeof query.q === 'string' && query.q.trim()) params.set(`${base}q`, query.q.trim());
  for (const key of Object.keys(query.filters || {}).sort()) {
    const value = query.filters[key];
    if (Array.isArray(value)) {
      const values = [...new Set(value.filter(v => typeof v === 'string' && v !== ''))].sort(collator.compare);
      if (values.length) params.set(`${base}f.${key}`, JSON.stringify(values));
    } else if (value && typeof value === 'object') {
      const range = {};
      for (const bound of ['min','max']) if (typeof value[bound] === 'number' && Number.isFinite(value[bound])) range[bound] = value[bound];
      if (Object.keys(range).length) params.set(`${base}f.${key}`, JSON.stringify(range));
    }
  }
  if (query.sort?.key && ['asc','desc'].includes(query.sort.dir)) params.set(`${base}sort`, `${query.sort.key}:${query.sort.dir}`);
  if (integer(query.page, 1) > 1) params.set(`${base}page`, String(query.page));
  if (integer(query.pageSize, null)) params.set(`${base}pageSize`, String(query.pageSize));
  return params.toString();
}

function matches(row, config, query, except) {
  if (query.q && !config.columns.some(c => text(row[c.key]).toLocaleLowerCase('en-AU').includes(query.q.toLocaleLowerCase('en-AU')))) return false;
  return Object.entries(query.filters || {}).every(([key, filter]) => {
    if (key === except || !config.columns.some(c => c.key === key)) return true;
    if (Array.isArray(filter)) return !filter.length || filter.includes(text(row[key]));
    const n = number(row[key]);
    return n != null && (filter.min == null || n >= filter.min) && (filter.max == null || n <= filter.max);
  });
}

function filteredRows(rows, config, query) {
  const filtered = publicRows(rows, config).filter(row => matches(row, config, query));
  const sort = query.sort || config.defaultSort;
  const column = config.columns.find(c => c.key === sort?.key && sortable(c));
  if (column) filtered.sort((a, b) => {
    let x = a[column.key], y = b[column.key];
    if (numeric(column)) { x = number(x); y = number(y); }
    if (column.type === 'date') { x = Date.parse(x); y = Date.parse(y); if (!Number.isFinite(x)) x = null; if (!Number.isFinite(y)) y = null; }
    if (x == null || x === '') return y == null || y === '' ? 0 : 1;
    if (y == null || y === '') return -1;
    const diff = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(text(x), text(y));
    return sort.dir === 'desc' ? -diff : diff;
  });
  return filtered;
}

export function applyQuery(rows, config, query = {}) {
  const safe = publicRows(rows, config);
  const filtered = filteredRows(safe, config, query);
  const pageSize = integer(query.pageSize, integer(config.pageSize, 50));
  const page = Math.min(integer(query.page, 1), Math.max(1, Math.ceil(filtered.length / pageSize)));
  const facets = Object.create(null);
  for (const column of config.columns.filter(c => c.facet || (c.hideWhenConstant ?? c.type === 'category'))) {
    const values = safe.filter(row => matches(row, config, query, column.key)).map(row => row[column.key]);
    if (column.facet === 'range') {
      const nums = values.map(number).filter(n => n != null);
      if (nums.length) facets[column.key] = {min:nums.reduce((a,b)=>Math.min(a,b)), max:nums.reduce((a,b)=>Math.max(a,b))};
    } else {
      const counts = new Map();
      for (const value of values) if (value != null && value !== '') counts.set(text(value), (counts.get(text(value)) || 0) + 1);
      facets[column.key] = [...counts].sort(([a],[b]) => collator.compare(a,b)).map(([value,count]) => ({value,count}));
    }
  }
  return {rows:filtered.slice((page - 1) * pageSize, page * pageSize), total:filtered.length, page, pageSize, facets:{...facets}};
}

export function toCSV(rows, config) {
  const quote = value => {
    let s = text(value);
    // Spreadsheet formulas remain inert; numeric money/count values stay exact.
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [config.columns.map(c => quote(c.label)).join(','), ...publicRows(rows, config).map(row => config.columns.map(c => quote(row[c.key] ?? '')).join(','))].join('\r\n');
}

function safePage(page, config) {
  const rows = publicRows(page.rows, config), facets = {};
  for (const [key, values] of Object.entries(page.facets || {})) {
    const column = config.columns.find(c => c.key === key);
    if (!column) continue;
    facets[key] = Array.isArray(values) && config.privacy === 'donors'
      ? values.filter(v => !donorColumn(column) || isOrganisationDonor({label:v.value})) : values;
  }
  // An unsafe server page cannot supply trustworthy whole-dataset aggregates.
  if (rows.length !== page.rows.length) return {rows, total:rows.length, page:1, pageSize:page.pageSize, facets:applyQuery(rows, config).facets};
  return {...page, rows, facets};
}

function constants(config, page, query) {
  const rows = config.rows ? filteredRows(config.rows, config, query) : null;
  return config.columns.filter(c => c.hideWhenConstant ?? c.type === 'category').flatMap(column => {
    const selected = query.filters?.[column.key];
    const facet = page.facets?.[column.key];
    const values = rows ? [...new Set(rows.map(row => text(row[column.key])))]
      : Array.isArray(selected) && selected.length === 1 && page.total > 0 ? selected
      : Array.isArray(facet) ? facet.map(v => v.value)
      : facet && facet.min === facet.max ? [text(facet.min)] : [];
    return values.length === 1 && values[0] ? [{column, value:values[0]}] : [];
  });
}

const button = (label, attrs = '') => `<button type="button" class="dt-button" ${attrs}>${label}</button>`;
const href = value => typeof value === 'string' && /^(?:https?:\/\/|\/(?!\/)|#|\.\.?\/)/i.test(value.trim()) ? value : null;
function chip(label, key, value, removable = true, title = label) {
  return removable ? button(`${esc(label)} <span aria-hidden="true">×</span>`, `data-remove="${esc(key)}" data-value="${esc(value)}" aria-label="Remove ${esc(label)}"`) : button(`${esc(label)} <span aria-hidden="true">×</span>`, `data-show-constant="${esc(key)}" title="${esc(title)}" aria-label="Show ${esc(label)} column"`);
}

function render(config, page, query = {}, view = {}, error = '') {
  const requested = query;
  page = safePage(page, config);
  query = cleanQuery(query, config, page);
  const redactedSearch = Boolean(requested.q && !query.q);
  const redactedFilters = serializeQuery({filters:requested.filters}) !== serializeQuery({filters:query.filters});
  const constant = constants(config, page, query).filter(v=>!view.constantsVisible?.includes(v.column.key)), hidden = new Set(constant.map(v => v.column.key));
  const visible = view.columnsVisible ?? config.columnsVisible ?? config.columns.map(c => c.key);
  const columns = config.columns.filter(c => visible.includes(c.key) && !hidden.has(c.key));
  if (!columns.length && config.columns.length) columns.push(config.columns.find(c => c.primary) || config.columns[0]);
  const sort = query.sort || config.defaultSort;
  const active = [], controls = [];
  if (query.q) active.push(chip(`Search: ${query.q}`, 'q', ''));
  if (redactedSearch) active.push(chip('Search applied', 'q', ''));
  if (redactedFilters) active.push(button('Filters applied <span aria-hidden="true">×</span>', 'data-clear aria-label="Clear all filters"'));
  for (const [key, filter] of Object.entries(query.filters || {})) {
    const column = config.columns.find(c => c.key === key);
    if (!column) continue;
    if (Array.isArray(filter)) for (const value of filter) active.push(chip(`${column.label}: ${value}`, key, value));
    else active.push(chip(`${column.label}: ${filter.min == null ? 'Any' : formatCell(filter.min,column)} – ${filter.max == null ? 'Any' : formatCell(filter.max,column)}`, key, ''));
  }
  for (const {column,value} of constant) if (!query.filters?.[column.key]) active.push(chip(`${column.label}: ${formatCell(value,column)}`, column.key, value, false, formatCell(value,{...column,format:'exact'})));
  for (const column of config.columns.filter(c => c.facet && !hidden.has(c.key))) {
    const facet = page.facets?.[column.key], selected = query.filters?.[column.key];
    if (column.facet === 'range') {
      controls.push(`<details class="dt-panel" data-panel="facet-${esc(column.key)}"><summary>${esc(column.label)}</summary><fieldset><legend class="dt-sr">${esc(column.label)}</legend>${['min','max'].map(bound => `<label>${bound === 'min' ? 'From' : 'To'}<input type="number" step="any" data-range="${esc(column.key)}" data-bound="${bound}" data-focus="${esc(column.key)}-${bound}" value="${esc(selected?.[bound] ?? '')}" placeholder="${esc(facet?.[bound] ?? '')}"></label>`).join('')}</fieldset></details>`);
    } else if (Array.isArray(facet) && facet.length) {
      const choices = facet.map(({value,count}) => {
        const checked = Array.isArray(selected) && selected.includes(value);
        return column.facet === 'chips'
          ? button(`${esc(value)} <span class="dt-muted">${decimal.format(count)}</span>`, `data-facet="${esc(column.key)}" data-value="${esc(value)}" aria-pressed="${checked}"`)
          : `<label class="dt-choice"><input type="checkbox" data-facet="${esc(column.key)}" value="${esc(value)}"${checked ? ' checked' : ''}>${esc(value)} <span class="dt-muted">${decimal.format(count)}</span></label>`;
      }).join('');
      controls.push(`<details class="dt-panel" data-panel="facet-${esc(column.key)}"><summary>${esc(column.label)}</summary><fieldset><legend class="dt-sr">${esc(column.label)}</legend>${choices}</fieldset></details>`);
    }
  }
  const prominence = columns.find(c => c.type === 'money' || c.type === 'count');
  const maxima = Object.fromEntries(columns.filter(c => c.bar).map(c => [c.key, page.rows.reduce((max,r)=>Math.max(max,Math.abs(number(r[c.key]) || 0)),0)]));
  const body = page.rows.map(row => `<tr role="row">${columns.map(column => {
    const value = row[column.key], display = formatCell(value,column), n = number(value);
    const exact = numeric(column) && n != null ? column.type === 'money' ? money.format(n) : decimal.format(n) : display;
    const link = column.primary && config.primaryLink ? href(config.primaryLink(row)) : null;
    const bar = column.bar && n != null && maxima[column.key] ? `<span class="dt-bar" aria-hidden="true" style="--dt-bar:${Math.round(Math.abs(n) / maxima[column.key] * 100)}%"></span>` : '';
    return `<td role="cell" data-label="${esc(column.label)}" data-align="${esc(column.align || (numeric(column) ? 'end' : 'start'))}"${column.primary ? ' data-primary' : ''}${column === prominence ? ' data-prominent' : ''}${numeric(column) ? ' class="dt-number"' : ''} title="${esc(exact)}">${bar}<span class="dt-value">${link ? `<a href="${esc(link)}">${esc(display)}</a>` : esc(display) || '—'}</span></td>`;
  }).join('')}${config.actions?.length ? `<td role="cell" class="dt-actions"><details class="dt-panel" data-panel="action"><summary aria-label="Actions" title="Actions"><span aria-hidden="true">⋯</span></summary><div>${config.actions.map(action => {
    const target = href(action.href(row));
    return target ? `<a href="${esc(target)}"><span aria-hidden="true">${esc(action.icon)}</span> ${esc(action.label)}</a>` : '';
  }).join('')}</div></details></td>` : ''}</tr>`).join('');
  const start = page.total ? (page.page - 1) * page.pageSize + 1 : 0;
  const count = `Showing ${decimal.format(start)}–${decimal.format(page.total ? start + page.rows.length - 1 : 0)} of ${decimal.format(page.total)}`;
  const data = JSON.stringify(page).replace(/</g,'\\u003c').replace(/&/g,'\\u0026');
  return `<section class="dt-root" data-datatable="${esc(config.id)}" data-density="${esc(view.density || config.density || 'comfortable')}" aria-label="${esc(config.caption)}">
<div class="dt-toolbar"><form role="search"><label class="dt-sr" for="${esc(config.id)}-search">Search ${esc(config.caption)}</label><input id="${esc(config.id)}-search" type="search" data-search data-focus="search" placeholder="Search" value="${esc(query.q || '')}" autocomplete="off"></form><div class="dt-tools"><select class="dt-phone-sort" data-sort-select aria-label="Sort">${config.columns.filter(sortable).map(c => ['asc','desc'].map(dir => `<option value="${esc(c.key)}:${dir}"${sort?.key === c.key && sort.dir === dir ? ' selected' : ''}>${esc(c.label)} ${dir === 'asc' ? '↑' : '↓'}</option>`).join('')).join('')}</select>${controls.join('')}<details class="dt-panel" data-panel="columns"><summary>Columns</summary><fieldset><legend class="dt-sr">Visible columns</legend>${config.columns.map(c => `<label class="dt-choice"><input type="checkbox" data-column="${esc(c.key)}"${columns.includes(c) ? ' checked' : ''}${columns.length === 1 && columns[0] === c ? ' disabled' : ''}>${esc(c.label)}</label>`).join('')}</fieldset></details>${button('Compact', `data-density-toggle aria-pressed="${(view.density || config.density) === 'compact'}"`)}${config.export === false ? '' : button('Export CSV', 'data-export')}</div></div>
<div class="dt-chips" aria-label="Applied filters">${active.join('')}${query.q || Object.keys(query.filters || {}).length || redactedSearch || redactedFilters ? button('Clear all', 'data-clear') : ''}</div>
<div class="dt-scroll"><table class="dt" id="${esc(config.id)}" role="table"><caption>${esc(config.caption)}</caption><thead role="rowgroup"><tr role="row">${columns.map(column => `<th role="columnheader" scope="col" data-align="${esc(column.align || (numeric(column) ? 'end' : 'start'))}"${sortable(column) ? ` aria-sort="${sort?.key === column.key ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'}"` : ''}>${sortable(column) ? button(`${esc(column.label)} <span aria-hidden="true">${sort?.key === column.key ? sort.dir === 'asc' ? '↑' : '↓' : '↕'}</span>`, `data-sort="${esc(column.key)}"`) : esc(column.label)}</th>`).join('')}${config.actions?.length ? '<th scope="col"><span class="dt-sr">Actions</span></th>' : ''}</tr></thead><tbody role="rowgroup">${error ? `<tr><td colspan="${columns.length + (config.actions?.length ? 1 : 0)}"><div class="dt-empty" role="alert">${esc(error)} ${button('Try again','data-retry')}</div></td></tr>` : body || `<tr><td colspan="${columns.length + (config.actions?.length ? 1 : 0)}"><div class="dt-empty">No results. Try another search or clear the filters.</div></td></tr>`}</tbody></table></div>
<div class="dt-footer"><p class="dt-count" role="status" aria-live="polite" aria-atomic="true">${error ? 'Table unavailable' : count}</p><div class="dt-paging">${button('Previous', `data-page="${page.page - 1}"${page.page <= 1 || error ? ' disabled' : ''}`)}<span>Page ${page.page}</span>${button('Next', `data-page="${page.page + 1}"${page.page * page.pageSize >= page.total || error ? ' disabled' : ''}`)}<label class="dt-sr" for="${esc(config.id)}-size">Rows per page</label><select id="${esc(config.id)}-size" data-page-size aria-label="Rows per page">${[...new Set([10,25,50,100,page.pageSize])].sort((a,b)=>a-b).map(size => `<option${size === page.pageSize ? ' selected' : ''}>${size}</option>`).join('')}</select></div></div>
<script type="application/json" data-dt-page>${data}</script></section>`;
}

export function dataTableHTML(config, page) { return render(config, page, {sort:config.defaultSort}); }

// Several mounted tables cannot undo each other's noindex state.
const robotsOwners = new WeakMap();
function setRobots(doc, root, active) {
  let state = robotsOwners.get(doc);
  if (!state) {
    const meta = doc.head.querySelector('meta[name="robots"]');
    state = {meta, original:meta?.getAttribute('content'), owners:new Set()};
    robotsOwners.set(doc,state);
  }
  if (active) state.owners.add(root); else state.owners.delete(root);
  if (state.owners.size) {
    if (!state.meta) { state.meta = doc.createElement('meta'); state.meta.name = 'robots'; doc.head.append(state.meta); }
    const original = (state.original || '').split(',').map(s=>s.trim()).filter(s=>s && !['index','all','noindex'].includes(s));
    state.meta.setAttribute('content', ['noindex', ...original].join(', '));
  } else if (state.meta) {
    if (state.original == null) { state.meta.remove(); state.meta = null; }
    else state.meta.setAttribute('content',state.original);
  }
}

export function mountDataTable(el, config) {
  const root = el.matches?.('[data-datatable]') ? el : el.matches?.('table') ? el.closest('[data-datatable]') : el;
  if (!root) throw new Error('Mount the SSR table or its container');
  const doc = root.ownerDocument, win = doc.defaultView;
  let query = config.urlKey ? parseQuery(new URL(win.location.href).searchParams,config.urlKey) : {};
  const view = {density:config.density || 'comfortable', columnsVisible:config.columnsVisible || config.columns.map(c=>c.key), constantsVisible:[]};
  let page;
  try { page = JSON.parse(root.querySelector('[data-dt-page]')?.textContent || 'null'); } catch { /* Client rows below. */ }
  page ||= {rows:[], total:0, page:1, pageSize:config.pageSize || 50};
  let controller, exportController, revision = 0, destroyed = false, timer;

  function paint(error = '') {
    if (destroyed) return;
    const active = doc.activeElement, inside = root.contains(active);
    const focused = inside ? active?.dataset?.focus : null;
    const identity = inside && !focused && Object.keys(active.dataset || {}).length ? JSON.stringify(active.dataset) : null;
    const focusTag = active?.tagName, focusValue = active?.getAttribute?.('value');
    const panel = inside && focusTag === 'SUMMARY' ? active.parentElement?.dataset.panel : null;
    const selection = focused ? [doc.activeElement.selectionStart, doc.activeElement.selectionEnd] : null;
    const open = [...root.querySelectorAll('details[open][data-panel]')].map(v=>v.dataset.panel);
    const status = root.querySelector('.dt-count');
    // Keep the live-region node attached through redraws.
    if (status) root.append(status);
    const template = doc.createElement('template');
    template.innerHTML = render(config,page,query,view,error);
    const section = template.content.firstElementChild;
    root.classList.add('dt-root'); root.dataset.datatable = config.id; root.dataset.density = view.density;
    root.setAttribute('aria-label',config.caption);
    for (const child of [...root.childNodes]) if (child !== status) child.remove();
    let message;
    if (status) { const next = section.querySelector('.dt-count'); message = next.textContent; next.remove(); }
    root.append(...section.childNodes);
    if (status) { root.querySelector('.dt-footer').prepend(status); status.textContent = message; }
    for (const detail of root.querySelectorAll('details[data-panel]')) if (open.includes(detail.dataset.panel)) detail.open = true;
    if (focused) for (const field of root.querySelectorAll('[data-focus]')) if (field.dataset.focus === focused) {
      field.focus({preventScroll:true});
      if (selection && field.type === 'search') field.setSelectionRange(...selection);
    }
    if (identity || panel) {
      const next = [...root.querySelectorAll('button,input,select,summary')].find(field=>field.tagName === focusTag && (panel ? field.parentElement?.dataset.panel === panel : JSON.stringify(field.dataset) === identity && field.getAttribute('value') === focusValue));
      (next || root.querySelector('[data-search]'))?.focus({preventScroll:true});
    }
  }
  function urlState() {
    if (!config.urlKey) return;
    const url = new URL(win.location.href), base = prefix(config.urlKey), state = cleanQuery(query,config,page);
    if (state.sort?.key === config.defaultSort?.key && state.sort?.dir === config.defaultSort?.dir) delete state.sort;
    if (state.pageSize === (config.pageSize || 50)) delete state.pageSize;
    for (const key of [...url.searchParams.keys()]) if (key.startsWith(base)) url.searchParams.delete(key);
    const encoded = serializeQuery(state,config.urlKey);
    for (const [key,value] of new URLSearchParams(encoded)) url.searchParams.set(key,value);
    win.history.replaceState(win.history.state,'',url);
    setRobots(doc,root,Boolean(encoded) || Boolean(serializeQuery({q:query.q,filters:query.filters})));
    const canonical = doc.head.querySelector('link[rel="canonical"]');
    if (canonical) {
      const clean = new URL(canonical.href,win.location.href);
      for (const key of [...clean.searchParams.keys()]) if (key.startsWith(base)) clean.searchParams.delete(key);
      canonical.href = clean.href;
    }
  }
  function endpoint(csv = false) {
    const url = new URL(config.source.endpoint,win.location.href);
    for (const [key,value] of Object.entries(config.source.params || {})) url.searchParams.set(key,value);
    const request = {...query,sort:query.sort || config.defaultSort,pageSize:integer(query.pageSize,integer(config.pageSize,50))};
    for (const [key,value] of new URLSearchParams(serializeQuery(request))) url.searchParams.set(key,value);
    if (csv) { url.searchParams.set('format','csv'); url.searchParams.delete('page'); url.searchParams.delete('pageSize'); }
    return url.href;
  }
  function analytics(event) {
    win.dispatchEvent(new win.CustomEvent('opax:analytics', {detail:{event, properties:{table_id:config.id, page_type:config.pageType}}}));
  }
  async function refresh() {
    clearTimeout(timer);
    const version = ++revision;
    controller?.abort();
    if (!config.source) {
      page = applyQuery(config.rows || [], config, query); query.page = page.page;
      paint(); urlState(); return;
    }
    controller = new win.AbortController(); root.setAttribute('aria-busy','true'); urlState();
    try {
      const response = await win.fetch(endpoint(),{signal:controller.signal});
      if (!response.ok) throw new Error('Table request failed');
      const result = await response.json();
      if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < 0 || !integer(result.page,null) || !integer(result.pageSize,null)) throw new Error('Invalid table page');
      if (destroyed || version !== revision) return;
      page = safePage(result,config); query.page = page.page;
      paint(); urlState();
    } catch (error) {
      if (error?.name !== 'AbortError' && !destroyed && version === revision) paint('Could not load this table.');
    } finally { if (!destroyed && version === revision) root.removeAttribute('aria-busy'); }
  }
  function update(event) { analytics(event); void refresh(); }
  function toggleFacet(key,value) {
    const selected = Array.isArray(query.filters?.[key]) ? query.filters[key] : [];
    const next = selected.includes(value) ? selected.filter(v=>v !== value) : [...selected,value];
    query.filters ||= {};
    if (next.length) query.filters[key] = next; else delete query.filters[key];
    query.page = 1; update('table_filter');
  }
  async function download() {
    const control = root.querySelector('[data-export]'); control.disabled = true;
    exportController?.abort(); exportController = new win.AbortController();
    try {
      let csv;
      if (config.source) {
        const response = await win.fetch(endpoint(true),{signal:exportController.signal});
        if (!response.ok) throw new Error('Export failed');
        csv = await response.text(); // Money endpoints enforce the full privacy index.
      } else csv = toCSV(filteredRows(config.rows || [],config,query),config);
      if (destroyed) return;
      const url = win.URL.createObjectURL(new win.Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a = doc.createElement('a'); a.href = url; a.download = config.export?.filename || `${config.id}.csv`;
      doc.body.append(a); a.click(); a.remove(); win.setTimeout(()=>win.URL.revokeObjectURL(url),0); analytics('table_export');
    } catch (error) {
      if (!destroyed && error?.name !== 'AbortError') root.querySelector('.dt-count').textContent = 'Could not export this table. Try again.';
    } finally { if (!destroyed) control.disabled = false; }
  }
  function click(event) {
    const target = event.target.closest('button');
    if (!target || !root.contains(target) || target.disabled) return;
    const data = target.dataset;
    if (own(data,'sort')) {
      const current = query.sort || config.defaultSort;
      query.sort = {key:data.sort, dir:current?.key === data.sort && current.dir === 'asc' ? 'desc' : 'asc'};
      query.page = 1; update('table_sort');
    } else if (own(data,'facet')) toggleFacet(data.facet,data.value);
    else if (own(data,'clear')) { delete query.q; delete query.filters; query.page = 1; update('table_filter'); }
    else if (own(data,'remove')) {
      if (data.remove === 'q') delete query.q;
      else if (Array.isArray(query.filters?.[data.remove])) query.filters[data.remove] = query.filters[data.remove].filter(v=>v !== data.value);
      else if (query.filters) delete query.filters[data.remove];
      query.page = 1; update('table_filter');
    } else if (own(data,'page')) { query.page = Number(data.page); void refresh(); }
    else if (own(data,'densityToggle')) { view.density = view.density === 'compact' ? 'comfortable' : 'compact'; paint(); }
    else if (own(data,'showConstant')) { view.constantsVisible.push(data.showConstant); if (!view.columnsVisible.includes(data.showConstant)) view.columnsVisible.push(data.showConstant); paint(); }
    else if (own(data,'export')) void download();
    else if (own(data,'retry')) void refresh();
  }
  function change(event) {
    const target = event.target, data = target.dataset;
    if (own(data,'sortSelect')) {
      const at = target.value.lastIndexOf(':');
      query.sort = {key:target.value.slice(0,at), dir:target.value.slice(at + 1)};
      query.page = 1; update('table_sort');
    } else if (own(data,'facet')) toggleFacet(data.facet,target.value);
    else if (own(data,'range')) {
      query.filters ||= {};
      const range = {...query.filters[data.range]}, n = number(target.value);
      if (n == null) delete range[data.bound]; else range[data.bound] = n;
      if (Object.keys(range).length) query.filters[data.range] = range; else delete query.filters[data.range];
      query.page = 1; update('table_filter');
    } else if (own(data,'column')) {
      const next = target.checked ? [...new Set([...view.columnsVisible,data.column])] : view.columnsVisible.filter(k=>k !== data.column);
      view.constantsVisible = target.checked ? [...new Set([...view.constantsVisible,data.column])] : view.constantsVisible.filter(k=>k !== data.column);
      if (next.length) view.columnsVisible = next;
      paint();
    } else if (own(data,'pageSize')) { query.pageSize = Number(target.value); query.page = 1; void refresh(); }
  }
  function input(event) {
    if (!own(event.target.dataset,'search')) return;
    query.q = event.target.value.trim(); query.page = 1;
    clearTimeout(timer); timer = win.setTimeout(()=>update('table_filter'),200);
  }
  function submit(event) { if (event.target.matches('form[role="search"]')) { event.preventDefault(); update('table_filter'); } }
  function popstate() { query = parseQuery(new URL(win.location.href).searchParams,config.urlKey); void refresh(); }
  root.addEventListener('click',click); root.addEventListener('change',change); root.addEventListener('input',input); root.addEventListener('submit',submit);
  if (config.urlKey) win.addEventListener('popstate',popstate);
  // SSR supplies a real page; server mode keeps it until its response arrives.
  if (config.source) paint();
  void refresh();
  return {destroy() {
    destroyed = true; revision++; clearTimeout(timer); controller?.abort(); exportController?.abort();
    root.removeAttribute('aria-busy');
    for (const [event,listener] of [['click',click],['change',change],['input',input],['submit',submit]]) root.removeEventListener(event,listener);
    if (config.urlKey) win.removeEventListener('popstate',popstate);
    setRobots(doc,root,false);
  }};
}
