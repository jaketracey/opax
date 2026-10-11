// Shared, dependency-free table renderer and query engine. Safe to import in a Worker.
import {isOrganisationDonor} from './donor-entity.js?v=ebb2c972d5';
import {unnamedDonorLabel,isUnnamedAggregate,donorsNotNamedDetail} from './donor-views.js?v=55a8bd3ae0';
import {shortDate} from './format.js';
import {queryValues,rawQueryValues,scrubQuery} from './datatable-query.js?v=6dd55aab38';

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
const recognised = (key,config) => {
  const base=prefix(config.urlKey);
  return ['q','sort','page','pageSize'].some(name=>key === base+name) || config.columns.some(c=>c.facet && key === `${base}f.${c.key}`);
};

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
// The aggregate has a separate, deliberately narrow shape. Never retain extra fields.
const aggregate = row => row?.aggregate?.kind === 'individual-donors' && Number.isSafeInteger(row.aggregate.count) && row.aggregate.count >= 0;
function candidateRows(rows, config) {
  return rows.flatMap(row => {
    if (row?.aggregate?.kind === 'individual-donors' && !aggregate(row)) return [];
    if (aggregate(row)) {
      const safe = {aggregate:{kind:'individual-donors',count:row.aggregate.count}};
      for (const c of config.columns) {
        if (['text','category'].includes(c.type) && (c.primary || donorColumn(c))) safe[c.key] = unnamedDonorLabel(row.aggregate.count);
        else if (numeric(c) && number(row[c.key]) != null) safe[c.key] = number(row[c.key]);
      }
      return [safe];
    }
    try { return config.privacy !== 'donors' || (config.rowPrivacyCheck ? config.rowPrivacyCheck(row) === true : isOrganisationDonor(donorNode(row))) ? [row] : []; } catch { return []; }
  });
}
const donorColumn = column => /^(?:donor(?:_?name)?|label|name)$/i.test(column.key) || column.primary;
const allowedText = (config, value, data = false) => {
  if (config.privacy !== 'donors') return true;
  try { return (data ? config.dataPrivacyCheck || config.privacyCheck : config.privacyCheck)?.(value) === true; } catch { return false; }
};
// A row is approved as a whole and by every decoded scalar, before any UI derives
// options, counts, chips or bars from it. Async browser checks populate approvals.
function rowPrivacyCheck(row, config) {
  return allowedText(config,JSON.stringify(row),true) && [...queryValues(row)].every(value=>allowedText(config,value,true));
}
const publicRows = (rows,config) => candidateRows(rows,config).filter(row=>rowPrivacyCheck(row,config));
const rejectedQueries = new WeakSet();
const blockedQuery = (config, query) => rejectedQueries.has(query) || [...queryValues(query)].some(value=>!allowedText(config,value));

/** SSR callers use the mutated URL for canonical and request-derived links. */
export function guardTableURL(config, input) {
  const url = input instanceof URL ? input : new URL(input,'https://local.invalid');
  const {params,rejected} = scrubQuery(url.searchParams,value=>allowedText(config,value),config.urlKey || '');
  url.search = params.toString();
  // No parser sees raw private content or repeated table keys.
  const query=rejected ? {} : parseQuery(params,config.urlKey);
  if (rejected) rejectedQueries.add(query);
  return {url,rejected,query};
}
function cleanQuery(query = {}, config, page) {
  const out = parseQuery(new URLSearchParams(serializeQuery(query)));
  if (!config) return out;
  if (blockedQuery(config,query)) return {};
  if (out.sort && !config.columns.some(c => c.key === out.sort.key && sortable(c))) delete out.sort;
  if (out.q && !allowedText(config,out.q)) delete out.q;
  if (out.filters) for (const [key, value] of Object.entries(out.filters)) {
    const column = config.columns.find(c => c.key === key && c.facet);
    if (!column) { delete out.filters[key]; continue; }
    if (Array.isArray(value)) {
      const options = config.rows ? publicRows(config.rows,config).map(row=>text(row[key]))
        : Array.isArray(page?.facets?.[key]) ? page.facets[key].map(f=>f.value) : [];
      const safe = value.filter(v=>options.includes(v) && (config.privacy !== 'donors' || allowedText(config,v)));
      if (safe.length) out.filters[key] = safe; else delete out.filters[key];
    } else if (column.facet !== 'range') delete out.filters[key];
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

const engines = new WeakMap();
function engine(rows, config) {
  let byColumns = engines.get(rows);
  if (!byColumns) engines.set(rows,byColumns = new Map());
  const key = JSON.stringify(config.columns.map(c=>[c.key,c.type,c.facet,c.hideWhenConstant,c.sortable,c.primary])) + config.privacy;
  if (byColumns.has(key) && byColumns.get(key).rowPolicy === config.rowPrivacyCheck) return byColumns.get(key);
  const candidates = candidateRows(rows,config);
  const result = {candidates, rowPolicy:config.rowPrivacyCheck, rowJSON:candidates.map(row=>JSON.stringify(row)), search:candidates.map(row=>config.columns.map(c=>text(row[c.key])).join('\n').normalize('NFKC').toLowerCase()), results:new Map()};
  byColumns.set(key,result);
  return result;
}
function resultFor(rows, config, query) {
  const data = engine(rows,config), rejected = blockedQuery(config,query);
  const approved=data.candidates.map(row=>rowPrivacyCheck(row,config));
  query = cleanQuery(query,{...config,rows:data.candidates});
  const key = serializeQuery({...query,sort:query.sort || config.defaultSort,page:1,pageSize:undefined}) + rejected + approved.map(Number).join('');
  if (data.results.has(key)) return data.results.get(key);
  const search = text(query.q).normalize('NFKC').toLowerCase();
  const filters = Object.entries(query.filters || {}).map(([key,filter])=>[key,Array.isArray(filter) ? new Set(filter) : filter]);
  const selected = [], facets = {}, counts = new Map();
  const facetColumns = config.columns.filter(c=>c.facet || (c.hideWhenConstant ?? c.type === 'category'));
  for (const c of facetColumns) counts.set(c.key,c.facet === 'range' ? {min:Infinity,max:-Infinity} : new Map());
  if (!rejected) for (let i=0;i<data.candidates.length;i++) {
    if (!approved[i]) continue;
    if (search && !data.search[i].includes(search)) continue;
    const row = data.candidates[i], failed = [];
    for (const [key,filter] of filters) {
      const n = number(row[key]);
      if (filter instanceof Set ? !filter.has(text(row[key])) : n == null || (filter.min != null && n < filter.min) || (filter.max != null && n > filter.max)) failed.push(key);
    }
    if (!failed.length) selected.push(row);
    for (const c of facetColumns) {
      if (failed.length && (failed.length !== 1 || failed[0] !== c.key)) continue;
      const value = row[c.key], count = counts.get(c.key);
      if (c.facet === 'range') { const n=number(value); if (n != null) { count.min=Math.min(count.min,n); count.max=Math.max(count.max,n); } }
      else if (value != null && value !== '') count.set(text(value),(count.get(text(value)) || 0)+1);
    }
  }
  const sort = query.sort || config.defaultSort, column = config.columns.find(c=>c.key === sort?.key && sortable(c));
  if (column) selected.sort((a,b)=>{
    let x=a[column.key],y=b[column.key];
    if (numeric(column)) { x=number(x); y=number(y); }
    if (column.type === 'date') { x=Date.parse(x); y=Date.parse(y); if (!Number.isFinite(x)) x=null; if (!Number.isFinite(y)) y=null; }
    if (x == null || x === '') return y == null || y === '' ? 0 : 1;
    if (y == null || y === '') return -1;
    const diff=typeof x === 'number' && typeof y === 'number' ? x-y : collator.compare(text(x),text(y));
    return sort.dir === 'desc' ? -diff : diff;
  });
  for (const c of facetColumns) {
    const count=counts.get(c.key);
    if (c.facet === 'range') { if (Number.isFinite(count.min)) facets[c.key]=count; }
    else facets[c.key]=[...count].sort(([a],[b])=>collator.compare(a,b)).map(([value,count])=>({value,count}));
  }
  const result={rows:selected,facets};
  // Bounded cache; inputs are immutable for a mounted table.
  if (data.results.size >= 16) data.results.delete(data.results.keys().next().value);
  data.results.set(key,result);
  return result;
}
const filteredRows = (rows,config,query) => resultFor(rows,config,query).rows;
export function applyQuery(rows, config, query = {}) {
  const result=resultFor(rows,config,query);
  if (blockedQuery(config,query)) return {rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}};
  const pageSize=integer(query.pageSize,integer(config.pageSize,50));
  const page=Math.min(integer(query.page,1),Math.max(1,Math.ceil(result.rows.length/pageSize)));
  return {rows:result.rows.slice((page-1)*pageSize,page*pageSize),total:result.rows.length,page,pageSize,facets:result.facets};
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
  const rows=publicRows(page.rows,config),facets={};
  for (const [key,values] of Object.entries(page.facets || {})) {
    const column=config.columns.find(c=>c.key === key);
    if (!column) continue;
    if (Array.isArray(values)) {
      facets[key]=values.filter(v=>v && typeof v.value === 'string' && Number.isFinite(v.count) && v.count >= 0)
        .filter(v=>config.privacy !== 'donors' || (donorColumn(column) ? isOrganisationDonor({label:v.value}) || isUnnamedAggregate(v.value) : true)
          && [...queryValues(v)].every(value=>allowedText(config,value,true)))
        .map(v=>({value:v.value,count:v.count}));
    } else if (values && Number.isFinite(values.min) && Number.isFinite(values.max) && [...queryValues(values)].every(value=>allowedText(config,value,true))) facets[key]={min:values.min,max:values.max};
  }
  // Unknown endpoint fields must never enter the hydration payload.
  const result={rows,total:Number.isSafeInteger(page.total) && page.total >= 0 && allowedText(config,String(page.total),true) ? page.total : rows.length,page:allowedText(config,String(page.page),true) ? integer(page.page,1) : 1,pageSize:allowedText(config,String(page.pageSize),true) ? integer(page.pageSize,config.pageSize || 50) : config.pageSize || 50,facets};
  if (rows.length !== page.rows.length) return {...result,total:rows.length,page:1,facets:applyQuery(rows,config).facets};
  return result;
}

function constants(config, page, query) {
  if (!page.total) return [];
  return config.columns.filter(c => c.hideWhenConstant ?? c.type === 'category').flatMap(column => {
    const selected = query.filters?.[column.key];
    const facet = page.facets?.[column.key];
    const values = Array.isArray(selected) && selected.length === 1 && page.total > 0 ? selected
      : Array.isArray(facet) ? facet.map(v => v.value)
      : facet && facet.min === facet.max ? [text(facet.min)] : [];
    return values.length === 1 && values[0] ? [{column, value:values[0]}] : [];
  });
}

// The same 20px stroke icons used by the design-system search/disclosure controls.
const icon = kind => `<svg class="dt-icon dt-icon-${kind}" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${kind === 'chevron' ? 'm5 7 5 5 5-5' : kind === 'asc' ? 'M10 16V4m-4 4 4-4 4 4' : kind === 'desc' ? 'M10 4v12m-4-4 4 4 4-4' : 'm6 7 4-4 4 4M10 3v14m-4-4 4 4 4-4'}"/></svg>`;
const summary = label => `<summary>${esc(label)}${icon('chevron')}</summary>`;
function menuIdentity(row, identities) {
  let hash=2166136261;
  for (const c of JSON.stringify(row)) hash=Math.imul(hash ^ c.charCodeAt(0),16777619) >>> 0;
  const key=hash.toString(36), occurrence=identities.get(key) || 0;
  identities.set(key,occurrence+1);
  return `${key}-${occurrence}`;
}
const button = (label, attrs = '') => `<button type="button" class="dt-button" ${attrs}>${label}</button>`;
const href = (value,config) => {
  if (typeof value !== 'string' || !/^(?:https?:\/\/|\/(?!\/)|#|\.\.?\/)/i.test(value.trim())) return null;
  if (!value.includes('?')) return value;
  const guarded=guardTableURL(config,value);
  if (!guarded.rejected) return value;
  const start=value.indexOf('?'), hash=value.indexOf('#',start), query=guarded.url.search;
  return value.slice(0,start)+query+(hash < 0 ? '' : value.slice(hash));
};
function chip(label, key, value, removable = true, title = label) {
  return removable ? button(`${esc(label)} <span aria-hidden="true">×</span>`, `data-remove="${esc(key)}" data-value="${esc(value)}" aria-label="Remove ${esc(label)}"`) : button(`${esc(label)} <span aria-hidden="true">×</span>`, `data-show-constant="${esc(key)}" title="${esc(title)}" aria-label="Show ${esc(label)} column"`);
}

function render(config, page, query = {}, view = {}, error = '') {
  const requested = query, rejected=blockedQuery(config,query);
  if (rejected) { page={rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}}; view={...view,rejected:true}; }
  page = safePage(page, config);
  query = cleanQuery(query, config, page);
  const redactedSearch = Boolean(requested.q && !query.q);
  const redactedFilters = serializeQuery({filters:requested.filters}) !== serializeQuery({filters:query.filters});
  const constant = (view.rejected ? [] : constants(config, page, query)).filter(v=>!view.constantsVisible?.includes(v.column.key)), hidden = new Set(constant.map(v => v.column.key));
  const visible = view.columnsVisible ?? config.columnsVisible ?? config.columns.map(c => c.key);
  const columns = config.columns.filter(c => visible.includes(c.key) && !hidden.has(c.key));
  if (!columns.length && config.columns.length) columns.push(config.columns.find(c => c.primary) || config.columns[0]);
  const sort = query.sort || config.defaultSort;
  const active = [], controls = [];
  if (view.rejected) active.push(button('Search unavailable <span aria-hidden="true">×</span>', 'data-clear aria-label="Clear search"'));
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
  for (const column of config.columns.filter(c => c.facet)) {
    const facet = page.facets?.[column.key], selected = query.filters?.[column.key];
    if (column.facet === 'range') {
      controls.push(`<details class="dt-panel" data-panel="facet-${esc(column.key)}">${summary(column.label)}<fieldset><legend class="dt-sr">${esc(column.label)}</legend>${['min','max'].map(bound => `<label>${bound === 'min' ? 'From' : 'To'}<input type="number" step="any" data-range="${esc(column.key)}" data-bound="${bound}" data-focus="${esc(column.key)}-${bound}" value="${esc(selected?.[bound] ?? '')}" placeholder="${esc(facet?.[bound] ?? '')}"></label>`).join('')}</fieldset></details>`);
    } else if (Array.isArray(facet) && facet.length) {
      const choices = facet.map(({value,count}) => {
        const checked = Array.isArray(selected) && selected.includes(value);
        return column.facet === 'chips'
          ? button(`${esc(value)} <span class="dt-muted">${decimal.format(count)}</span>`, `data-facet="${esc(column.key)}" data-value="${esc(value)}" aria-pressed="${checked}"`)
          : `<label class="dt-choice"><input type="checkbox" data-facet="${esc(column.key)}" value="${esc(value)}"${checked ? ' checked' : ''}>${esc(value)} <span class="dt-muted">${decimal.format(count)}</span></label>`;
      }).join('');
      controls.push(`<details class="dt-panel" data-panel="facet-${esc(column.key)}">${summary(column.label)}<fieldset><legend class="dt-sr">${esc(column.label)}</legend>${choices}</fieldset></details>`);
    }
  }
  const prominence = columns.find(c => c.type === 'money' || c.type === 'count');
  const maxima = Object.fromEntries(columns.filter(c => c.bar).map(c => {
    const range=page.facets?.[c.key], rows=page.rows;
    return [c.key,range && !Array.isArray(range) ? Math.max(Math.abs(range.min),Math.abs(range.max)) : rows.reduce((max,r)=>Math.max(max,Math.abs(number(r[c.key]) || 0)),0)];
  }));
  const menuIdentities=new Map();
  const body = page.rows.map(row => `<tr role="row">${columns.map(column => {
    const value = row[column.key], display = formatCell(value,column), n = number(value);
    const exact = numeric(column) && n != null ? column.type === 'money' ? money.format(n) : decimal.format(n) : display;
    const link = !aggregate(row) && column.primary && config.primaryLink ? href(config.primaryLink(row),config) : null;
    const bar = column.bar && n != null && maxima[column.key] ? `<span class="dt-bar-track" aria-hidden="true"><span class="dt-bar" style="--dt-bar:${Math.min(100,Math.round(Math.abs(n) / maxima[column.key] * 100))}%"></span></span>` : '';
    return `<td role="cell" data-label="${esc(column.label)}" data-align="${esc(column.align || (numeric(column) ? 'end' : 'start'))}"${column.primary ? ' data-primary' : ''}${column === prominence ? ' data-prominent' : ''}${numeric(column) ? ' class="dt-number"' : ''} title="${esc(exact)}">${aggregate(row) && (column.primary || donorColumn(column)) && isUnnamedAggregate(display) ? `<details class="donor-aggregate"><summary>${esc(display)}</summary><p>${esc(donorsNotNamedDetail)}</p></details>` : `<span class="dt-value">${link ? `<a href="${esc(link)}">${esc(display)}</a>` : esc(display) || '—'}</span>`}${bar}</td>`;
  }).join('')}${config.actions?.length ? aggregate(row) ? '<td role="cell" class="dt-actions"></td>' : `<td role="cell" class="dt-actions"><details class="dt-panel" data-panel="action-${menuIdentity(row,menuIdentities)}"><summary aria-label="Actions" title="Actions"><span aria-hidden="true">⋯</span></summary><div>${config.actions.map(action => {
    const target = href(action.href(row),config);
    return target ? `<a href="${esc(target)}"><span aria-hidden="true">${esc(action.icon)}</span> ${esc(action.label)}</a>` : '';
  }).join('')}</div></details></td>` : ''}</tr>`).join('');
  const start = page.total ? (page.page - 1) * page.pageSize + 1 : 0;
  const count = `Showing ${decimal.format(start)}–${decimal.format(page.total ? start + page.rows.length - 1 : 0)} of ${decimal.format(page.total)}`;
  const data = JSON.stringify(page).replace(/</g,'\\u003c').replace(/&/g,'\\u0026');
  return `<section class="dt-root" data-datatable="${esc(config.id)}" data-density="${esc(view.density || config.density || 'comfortable')}" aria-label="${esc(config.caption)}">
<div class="dt-toolbar"><form role="search"><label class="dt-sr" for="${esc(config.id)}-search">Search ${esc(config.caption)}</label><input id="${esc(config.id)}-search" type="search" data-search data-focus="search" placeholder="Search" value="${esc(query.q || '')}" autocomplete="off"></form><select class="dt-phone-sort" data-sort-select aria-label="Sort">${config.columns.filter(sortable).map(c => ['asc','desc'].map(dir => `<option value="${esc(c.key)}:${dir}"${sort?.key === c.key && sort.dir === dir ? ' selected' : ''}>${esc(c.label)} ${dir === 'asc' ? 'ascending' : 'descending'}</option>`).join('')).join('')}</select><details class="dt-panel dt-filters" data-panel="filters">${summary('Filters')}<div class="dt-tools">${controls.join('')}<details class="dt-panel" data-panel="columns">${summary('Columns')}<fieldset><legend class="dt-sr">Visible columns</legend>${config.columns.map(c => `<label class="dt-choice"><input type="checkbox" data-column="${esc(c.key)}"${columns.includes(c) ? ' checked' : ''}${columns.length === 1 && columns[0] === c ? ' disabled' : ''}>${esc(c.label)}</label>`).join('')}</fieldset></details>${button('Compact', `data-density-toggle aria-pressed="${(view.density || config.density) === 'compact'}"`)}</div></details>${config.export === false ? '' : button('Export CSV', `data-export${view.rejected ? ' disabled' : ''}`)}</div>
<div class="dt-chips" aria-label="Applied filters">${active.join('')}${query.q || Object.keys(query.filters || {}).length || redactedSearch || redactedFilters || view.rejected ? button('Clear all', 'data-clear') : ''}</div>
<div class="dt-scroll"><table class="dt" id="${esc(config.id)}" role="table"><caption>${esc(config.caption)}</caption><thead role="rowgroup"><tr role="row">${columns.map(column => `<th role="columnheader" scope="col" data-align="${esc(column.align || (numeric(column) ? 'end' : 'start'))}"${sortable(column) ? ` aria-sort="${sort?.key === column.key ? sort.dir === 'asc' ? 'ascending' : 'descending' : 'none'}"` : ''}>${sortable(column) ? button(`${esc(column.label)} ${icon(sort?.key === column.key ? sort.dir : 'unsorted')}`, `data-sort="${esc(column.key)}"`) : esc(column.label)}${column.bar && maxima[column.key] ? `<small class="dt-scale">0–${esc(formatCell(maxima[column.key],column))}</small>` : ''}</th>`).join('')}${config.actions?.length ? '<th scope="col"><span class="dt-sr">Actions</span></th>' : ''}</tr></thead><tbody role="rowgroup">${error ? `<tr><td colspan="${columns.length + (config.actions?.length ? 1 : 0)}"><div class="dt-empty" role="alert">${esc(error)} ${button('Try again','data-retry')}</div></td></tr>` : body || `<tr><td colspan="${columns.length + (config.actions?.length ? 1 : 0)}"><div class="dt-empty">No results. Try another search or clear the filters.</div></td></tr>`}</tbody></table></div>
<div class="dt-footer"><p class="dt-count" role="status" aria-live="polite" aria-atomic="true">${error ? 'Table unavailable' : count}</p><div class="dt-paging">${button('Previous', `data-page="${page.page - 1}"${page.page <= 1 || error ? ' disabled' : ''}`)}<span>Page ${page.page}</span>${button('Next', `data-page="${page.page + 1}"${page.page * page.pageSize >= page.total || error ? ' disabled' : ''}`)}<label class="dt-page-size" for="${esc(config.id)}-size">Rows per page <select id="${esc(config.id)}-size" data-page-size aria-label="Rows per page">${[...new Set([10,25,50,100,page.pageSize])].sort((a,b)=>a-b).map(size => `<option${size === page.pageSize ? ' selected' : ''}>${size}</option>`).join('')}</select></label></div></div>
<script type="application/json" data-dt-page>${data}</script></section>`;
}

export function dataTableHTML(config, page, requestURL) {
  if (!requestURL) return render(config,page,{sort:config.defaultSort});
  const {query,rejected}=guardTableURL(config,requestURL);
  if (rejected) page={rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}};
  return render(config,page,query,{rejected});
}

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
  let query = {}, rawURL, rawPage, lastURL, rawRejected = false;
  let initialRejected = root.hasAttribute('data-dt-rejected');
  const rawConfig = config, approvals = new Map(), dataApprovals = new Map();
  if (config.privacy === 'donors') config = {...config,privacyCheck:value=>approvals.get(value) === true,dataPrivacyCheck:value=>dataApprovals.get(value) === true};
  const view = {density:config.density || 'comfortable', columnsVisible:config.columnsVisible || config.columns.map(c=>c.key), constantsVisible:[]};
  let page;
  try { page = JSON.parse(root.querySelector('[data-dt-page]')?.textContent || 'null'); } catch { /* Client rows below. */ }
  page ||= {rows:[], total:0, page:1, pageSize:config.pageSize || 50};
  let controller, exportController, revision = 0, destroyed = false, timer;
  const canonical=doc.head.querySelector('link[rel="canonical"]'), canonicalURL=canonical?.href;
  const requestLinks=new Map([...doc.querySelectorAll?.('a[href]') || []].map(link=>[link,link.getAttribute('href')]));
  const linkInputs=()=>[canonicalURL,...requestLinks.values()].filter(Boolean).flatMap(value=>[...rawQueryValues(new URL(value,win.location.href).searchParams)]);
  const rowLinkInputs=rows=>publicRows(rows,config).flatMap(row=>{
    if(aggregate(row))return [];
    return [config.primaryLink,...(config.actions || []).map(action=>action.href)].filter(Boolean).flatMap(link=>{
      try {const value=link(row);return value ? [...rawQueryValues(new URL(value,win.location.href).searchParams)] : [];} catch {return [];}
    });
  });

  function replaceURL(url) {
    win.history.replaceState(win.history.state,'',url); lastURL=String(url);
  }
  function scrubHead() {
    if (canonical) {
      const clean=guardTableURL(config,new URL(canonicalURL,win.location.href)).url;
      for (const key of [...clean.searchParams.keys()]) if (recognised(key,config)) clean.searchParams.delete(key);
      canonical.href=clean.href;
    }
    for (const [link,value] of requestLinks) {
      const clean=href(value,config);
      if (clean != null && clean !== link.getAttribute('href')) link.setAttribute('href',clean);
    }
  }
  function captureURL() {
    rawURL=new URL(win.location.href);
    rawPage ||= page;
    // Async predicates have no approvals yet. Quarantine those pairs now, before
    // the first render or await; safe unrelated pairs are restored after checking.
    const guarded=guardTableURL(config,new URL(rawURL));
    replaceURL(guarded.url);
    scrubHead();
    view.rejected=config.privacy === 'donors' || guarded.rejected;
    if (view.rejected) page={rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}};
  }

  function paint(error = '') {
    if (destroyed) return;
    if (win.location.href !== lastURL) { captureURL(); void refresh(); return; }
    const active = doc.activeElement, inside = root.contains(active);
    const focused = inside ? active?.dataset?.focus : null;
    const identity = inside && !focused && Object.keys(active.dataset || {}).length ? JSON.stringify(active.dataset) : null;
    const focusTag = active?.tagName, focusValue = active?.getAttribute?.('value');
    const panel = inside && focusTag === 'SUMMARY' ? active.parentElement?.dataset.panel : null;
    const selection = view.searchSelection || (focused ? [doc.activeElement.selectionStart, doc.activeElement.selectionEnd] : null);
    const open = [...root.querySelectorAll('details[open][data-panel]')].map(v=>v.dataset.panel).filter(value=>!value.startsWith('action-'));
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
    const url = guardTableURL(config,new URL(win.location.href)).url, state = cleanQuery(query,config,page);
    if (state.sort?.key === config.defaultSort?.key && state.sort?.dir === config.defaultSort?.dir) delete state.sort;
    if (state.pageSize === (config.pageSize || 50)) delete state.pageSize;
    for (const key of [...url.searchParams.keys()]) if (recognised(key,config)) url.searchParams.delete(key);
    const encoded = serializeQuery(state,config.urlKey);
    const checked=scrubQuery(new URLSearchParams(encoded),value=>allowedText(config,value),config.urlKey || '');
    for (const [key,value] of checked.params) url.searchParams.set(key,value);
    replaceURL(url);
    setRobots(doc,root,Boolean(encoded));
    scrubHead();
  }
  function endpoint(csv = false, state = query) {
    const url = new URL(config.source.endpoint,win.location.href);
    for (const [key,value] of Object.entries(config.source.params || {})) url.searchParams.set(key,value);
    const request = {...state,sort:state.sort || config.defaultSort,pageSize:integer(state.pageSize,integer(config.pageSize,50))};
    for (const [key,value] of new URLSearchParams(serializeQuery(request))) url.searchParams.set(key,value);
    if (csv) { url.searchParams.set('format','csv'); url.searchParams.delete('page'); url.searchParams.delete('pageSize'); }
    return url.href;
  }
  function analytics(event) {
    win.dispatchEvent(new win.CustomEvent('opax:analytics', {detail:{event, properties:{table_id:config.id, page_type:config.pageType}}}));
  }
  async function permit(value, data = false) {
    const cache = data ? dataApprovals : approvals;
    if (config.privacy !== 'donors') return true;
    if (cache.has(value)) return cache.get(value);
    let safe=false;
    try {
      const check=data ? rawConfig.dataPrivacyCheck || rawConfig.privacyCheck : rawConfig.privacyCheck;
      if (check) safe=await check(value) === true;
      else {
        const response=await win.fetch('/api/table/privacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:value})});
        safe=response.ok && (await response.json()).safe === true;
      }
    } catch { /* Fail closed, including an unavailable shared index. */ }
    if (safe) cache.set(value,true);
    return safe;
  }
  async function permitSet(values, data = false) {
    const cache=data ? dataApprovals : approvals;
    const pending=[...new Set(values)].filter(v=>!cache.has(v));
    if (!pending.length) return;
    if (await permit(pending.join('\n'),data)) for (const value of pending) cache.set(value,true);
    else await Promise.all(pending.map(value=>permit(value,data)));
  }
  async function refresh() {
    clearTimeout(timer);
    if (win.location.href !== lastURL) captureURL();
    const version = ++revision;
    controller?.abort(); exportController?.abort();
    if (rawURL) {
      const captured=rawURL;
      root.setAttribute('aria-busy','true'); paint();
      if (config.privacy === 'donors') await permitSet([...rawQueryValues(captured.searchParams),...linkInputs()]);
      if (destroyed || version !== revision) return;
      const guarded=guardTableURL(config,captured);
      rawURL=undefined; rawRejected=guarded.rejected; query=guarded.query;
      replaceURL(guarded.url); scrubHead();
    }
    const pending=structuredClone(query), previousPage=rawPage || page;
    rawPage=undefined;
    if (config.privacy === 'donors') {
      const values=[...queryValues(pending),...rawQueryValues(new URLSearchParams(serializeQuery(pending,config.urlKey)))];
      const data=config.rows ? engine(config.rows,config) : null;
      const needsValidation=values.some(value=>!approvals.has(value)) || (data ? data.rowJSON.some(row=>!dataApprovals.has(row)) : page.rows.some(row=>!dataApprovals.has(JSON.stringify(row))));
      // Pending query values never render against old SSR rows. Already approved state can
      // retain its controls and focus while fetching, avoiding a second redraw.
      if (needsValidation) {
        if (doc.activeElement?.dataset?.focus === 'search') view.searchSelection=[doc.activeElement.selectionStart,doc.activeElement.selectionEnd];
        page={rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}};
        view.rejected=true;
        paint(); urlState();
      }
      root.setAttribute('aria-busy','true');
      await permitSet(values);
      if (data) {
        await permitSet(data.candidates.flatMap(row=>[JSON.stringify(row),...queryValues(row)]),true);
        await permitSet(rowLinkInputs(data.candidates));
      }
      if (destroyed || version !== revision) return;
    }
    const rejected=initialRejected || rawRejected || blockedQuery(config,pending); view.rejected=rejected;
    query=cleanQuery(pending,config,previousPage);
    if (rejected) {
      page={rows:[],total:0,page:1,pageSize:config.pageSize || 50,facets:{}};
      paint(); delete view.searchSelection; urlState(); root.removeAttribute('aria-busy'); return;
    }
    if (!config.source) {
      page=applyQuery(config.rows || [],config,query);
      await permitSet([...queryValues({page:page.page,pageSize:page.pageSize,total:page.total,facets:page.facets})],true);
      await permitSet([...queryValues({...query,page:page.page}),...rawQueryValues(new URLSearchParams(serializeQuery({...query,page:page.page},config.urlKey)))]);
      if (destroyed || version !== revision) return;
      query.page=page.page;
      paint(); delete view.searchSelection; urlState(); root.removeAttribute('aria-busy'); return;
    }
    controller=new win.AbortController(); root.setAttribute('aria-busy','true'); urlState();
    try {
      const response=await win.fetch(endpoint(),{signal:controller.signal});
      if (!response.ok) throw new Error('Table request failed');
      const result=await response.json();
      if (!Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < 0 || !integer(result.page,null) || !integer(result.pageSize,null)) throw new Error('Invalid table page');
      const candidate={rows:candidateRows(result.rows,config),total:result.total,page:result.page,pageSize:result.pageSize};
      // Validate all supplied facet text, including options outside this page.
      candidate.facets=result.facets || {};
      if (config.privacy === 'donors') {
        const texts=[...candidate.rows.flatMap(row=>[JSON.stringify(row),...queryValues(row)]),...queryValues({page:candidate.page,pageSize:candidate.pageSize,total:candidate.total,facets:candidate.facets})];
        await permitSet(texts,true);
        await permitSet(rowLinkInputs(candidate.rows));
        await permitSet([...queryValues({...query,page:candidate.page}),...rawQueryValues(new URLSearchParams(serializeQuery({...query,page:candidate.page},config.urlKey)))]);
        // Invalid rows are dropped; safePage recomputes counts and facets from
        // the surviving rows instead of trusting metadata for rejected records.
      }
      if (destroyed || version !== revision) return;
      page=safePage(candidate,config); query.page=page.page;
      paint(); delete view.searchSelection; urlState();
    } catch (error) {
      if (error?.name !== 'AbortError' && !destroyed && version === revision) paint('Could not load this table.');
    } finally { if (!destroyed && version === revision) root.removeAttribute('aria-busy'); }
  }

  function update(event) { initialRejected=false; root.removeAttribute('data-dt-rejected'); analytics(event); void refresh(); }
  function toggleFacet(key,value) {
    const selected = Array.isArray(query.filters?.[key]) ? query.filters[key] : [];
    const next = selected.includes(value) ? selected.filter(v=>v !== value) : [...selected,value];
    query.filters ||= {};
    if (next.length) query.filters[key] = next; else delete query.filters[key];
    query.page = 1; update('table_filter');
  }
  async function download() {
    // A caller can change history without popstate. Audit raw input again before
    // any export request, even when the mounted parsed state has not changed.
    if (win.location.href !== lastURL) { captureURL(); void refresh(); return; }
    if (root.getAttribute('aria-busy') === 'true') return;
    if (view.rejected) return;
    const requested=structuredClone(query), exportRevision=revision;
    const control = root.querySelector('[data-export]'); control.disabled = true;
    exportController?.abort(); exportController = new win.AbortController();
    try {
      await permitSet([...queryValues(requested)]);
      if (destroyed || revision !== exportRevision || view.rejected) return;
      if (blockedQuery(config,requested)) { void refresh(); return; }
      const state=cleanQuery(requested,config,page);
      let csv, truncated=false;
      if (config.source) {
        const response = await win.fetch(endpoint(true,state),{signal:exportController.signal});
        if (!response.ok) throw new Error('Export failed');
        truncated=response.headers.get('x-table-export-truncated') === 'true';
        csv = await response.text();

      } else csv = toCSV(filteredRows(config.rows || [],config,state),config);
      if (!await permit(csv,true)) throw new Error('Unsafe table export');
      if (destroyed || revision !== exportRevision || view.rejected) return;
      const url = win.URL.createObjectURL(new win.Blob([csv],{type:'text/csv;charset=utf-8'}));
      const a = doc.createElement('a'); a.href = url; a.download = config.export?.filename || `${config.id}.csv`;
      doc.body.append(a); a.click(); a.remove(); win.setTimeout(()=>win.URL.revokeObjectURL(url),0); analytics('table_export');
      if (truncated) root.querySelector('.dt-count').textContent='Export limited to 50,000 rows. Narrow the filters to export more.';
    } catch (error) {
      if (!destroyed && error?.name !== 'AbortError') root.querySelector('.dt-count').textContent = 'Could not export this table. Try again.';
    } finally { if (!destroyed) control.disabled = Boolean(view.rejected); }
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
    else if (own(data,'clear')) { rawRejected=false; delete query.q; delete query.filters; query.page = 1; update('table_filter'); }
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
  function keydown(event) {
    if (event.key !== 'Escape') return;
    const detail=event.target.closest('details[open]');
    if (!detail || !root.contains(detail)) return;
    detail.open=false; detail.querySelector(':scope > summary').focus(); event.preventDefault();
  }
  function popstate() { captureURL(); void refresh(); }
  root.addEventListener('click',click); root.addEventListener('change',change); root.addEventListener('input',input); root.addEventListener('submit',submit); root.addEventListener('keydown',keydown);
  win.addEventListener('popstate',popstate);
  captureURL();
  void refresh();
  return {destroy() {
    destroyed = true; revision++; clearTimeout(timer); controller?.abort(); exportController?.abort();
    root.removeAttribute('aria-busy');
    for (const [event,listener] of [['click',click],['change',change],['input',input],['submit',submit],['keydown',keydown]]) root.removeEventListener(event,listener);
    win.removeEventListener('popstate',popstate);
    setRobots(doc,root,false);
  }};
}
