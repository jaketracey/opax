// Division and voting-record rollout. Configs use the frozen DataTable contract.
import {dataTableHTML, mountDataTable, applyQuery} from './datatable.js?v=9b1adb0638';
import {shortDate} from './format.js';
import {statusLabelHTML} from './labels.js?v=804befe8de';
import {divisionPlain} from './division-markdown.js?v=5991511166';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const sentence = value => { const text = String(value || '').replace(/_/g, ' ').trim(); return text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : ''; };
const count = value => value == null || value === '' ? null : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const safeLink = value => typeof value === 'string' && /^(?:\/(?!\/)|https?:\/\/)/i.test(value) ? value : null;
const divisionLink = value => /^[a-z0-9][a-z0-9-]*$/.test(String(value || '')) ? `/doc/${String(value).startsWith('division-') ? value : `division-${value}`}` : null;

export const divisionColumns = [
  {key:'title', label:'Title', type:'text', primary:true},
  {key:'date', label:'Date', type:'date'},
  {key:'chamber', label:'Chamber', type:'category', facet:'chips'},
  {key:'outcome', label:'Outcome', type:'category', facet:'chips'},
  {key:'ayes', label:'Ayes', type:'count', format:'exact'},
  {key:'noes', label:'Noes', type:'count', format:'exact'},
];
export const voteColumns = [
  {key:'title', label:'Bill or division', type:'text', primary:true},
  {key:'date', label:'Date', type:'date'},
  {key:'vote', label:'Vote', type:'category', facet:'chips'},
  {key:'party_position', label:'Party position', type:'category', facet:'chips'},
];

export function divisionTableConfig(params = {}, caption = 'Divisions', pageType = 'bill') {
  return {id:'division-table', caption, columns:divisionColumns, source:{endpoint:'/api/table/divisions', params},
    pageSize:25, defaultSort:{key:'date', dir:'desc'}, primaryLink:row => safeLink(row.href),
    export:{filename:'divisions.csv'}, urlKey:'dv', pageType};
}
export function voteTableConfig(person, caption = 'Voting record') {
  return {id:'vote-table', caption, columns:voteColumns, source:{endpoint:'/api/table/votes', params:{person}},
    pageSize:25, defaultSort:{key:'date', dir:'desc'}, primaryLink:row => safeLink(row.href),
    export:{filename:'voting-record.csv'}, urlKey:'vr', pageType:'person'};
}

const chambers = {senate:'Senate', representatives:'House of Representatives', nsw_la:'New South Wales Legislative Assembly',
  nsw_lc:'New South Wales Legislative Council', vic_la:'Victorian Legislative Assembly', vic_lc:'Victorian Legislative Council', qld_la:'Queensland Legislative Assembly'};
export function divisionRows(divisions = [], deduplicate = false) {
  const unique = new Map();
  for (const division of divisions) {
    const stage = (division.stage ? sentence(division.stage) : divisionPlain(division.title)) || 'Division';
    const date = String(division.date || '');
    // Keep the existing bill-list rule: repeated register counts are one row.
    const key = deduplicate ? [date, stage, division.ayes, division.noes, division.house].join('|') : division.slug || division.key || unique.size;
    if (unique.has(key)) continue;
    const outcome = ({affirmative:'Agreed', negative:'Not agreed'}[division.outcome || division.result]) || sentence(division.outcome || division.result) || 'Not recorded';
    unique.set(key, {title:[stage, date ? shortDate(date) : ''].filter(Boolean).join(', '), date,
      chamber:chambers[division.house] || sentence(division.house) || 'Not recorded', outcome,
      ayes:count(division.ayes), noes:count(division.noes),
      href:divisionLink(division.slug || division.key) || safeLink(division.source_url || division.url)});
  }
  return [...unique.values()];
}
const billIndexes = new WeakMap();
const titleKey = value => String(value || '').replace(/\s+/g,' ').trim().toLowerCase();
export function votingRows(votes = [], bills = []) {
  let index = billIndexes.get(bills);
  if (!index) {
    index = new Map();
    for (const bill of bills) for (const title of new Set([bill.title,...(bill.aliases || [])])) {
      if (!title) continue;
      const key = titleKey(title);
      if (!index.has(key)) index.set(key,[]);
      index.get(key).push(bill);
    }
    billIndexes.set(bills,index);
  }
  return votes.map(v => {
    const title = divisionPlain(v.title || v.name || 'Division');
    const matches = (index.get(titleKey(v.title || v.name)) || []).filter(b=>!v.jur || b.jurisdiction===v.jur);
    const billKey = v.bill_key || (matches.length===1 ? matches[0].key : '');
    return {title, date:String(v.date || ''),
    vote:({aye:'Aye', no:'No', paired:'Paired', absent:'Absent'}[v.vote]) || sentence(v.vote) || 'Not recorded',
    // Only a position explicitly supplied by this vote's source is shown.
    party_position:sentence(v.party_position) || 'Not recorded',
    href:divisionLink(v.division_slug) || (/^au-[a-z0-9-]+$/.test(billKey) ? `/bill/${billKey}` : safeLink(v.source_url)) || `/ask?view=search&q=${encodeURIComponent(title)}`};
  });
}

export function voteTablePage(rows, config, query = {}) {
  return applyQuery(rows, config, {...query, sort:query.sort || config.defaultSort});
}

// Presentation stays outside the core: the contract has no cell-render callback.
function outcomeCell(html, rows) {
  let index = 0;
  return html.replace(/(<td\b[^>]*data-label="Outcome"[^>]*>)([\s\S]*?)(<\/td>)/g, (_, start, cell, end) => {
    const word = String(rows[index++]?.outcome || 'Not recorded');
    const label = statusLabelHTML(word, word === 'Agreed' ? 'done' : 'ended');
    return start + (cell.includes('class="dt-value"') ? cell.replace(/(<span class="dt-value">)[\s\S]*?(<\/span>)/, (_, open, close) => open + label + close) : label) + end;
  });
}
export function voteTableHTML(config, page) {
  let html = dataTableHTML(config, page);
  // The frozen branch's stub lacks links and cell labels. This small SSR bridge
  // disappears naturally once DT-core provides its contract-shaped markup.
  if (!html.includes('data-datatable=')) {
    let rowIndex = 0;
    html = html.replace(/<tbody>([\s\S]*?)<\/tbody>/, (_, body) => '<tbody>' + body.replace(/<tr>([\s\S]*?)<\/tr>/g, (_, cells) => {
      const row = page.rows[rowIndex++]; let columnIndex = 0;
      return '<tr>' + cells.replace(/<td>[\s\S]*?<\/td>/g, () => {
        const column = config.columns[columnIndex++]; const value = row[column.key];
        let display = column.type === 'date' ? shortDate(value) : column.type === 'count' && typeof value === 'number' ? value.toLocaleString('en-AU') : value ?? '—';
        display = esc(display);
        const href = column.primary && config.primaryLink?.(row);
        return `<td data-label="${esc(column.label)}"${column.primary ? ' data-primary' : ''}${column === config.columns.find(c=>c.type==='count') ? ' data-prominent' : ''}${column.type === 'count' ? ' data-align="end"' : ''}>${href ? `<a href="${esc(href)}">${display}</a>` : display}</td>`;
      }) + '</tr>';
    }) + '</tbody>');
  }
  const json = JSON.stringify(config).replace(/</g, '\\u003c').replace(/&/g, '\\u0026');
  return `<div class="vote-table" data-vote-table>${outcomeCell(html,page.rows)}<script type="application/json" data-vote-config>${json}</script></div>`;
}

const mounted = new Map();
export function mountVoteTables(root = document) {
  for (const [el, handle] of mounted) if (!el.isConnected) { handle.destroy(); mounted.delete(el); }
  for (const el of root.querySelectorAll('[data-vote-table]')) {
    if (mounted.has(el)) continue;
    // The SPA preserves a hidden crawlable answer. Its visible panel owns hydration.
    // Hubs remove the SPA scripts and hydrate their server-rendered table directly.
    if (el.closest('#prerender') && el.ownerDocument.querySelector('script[src^="/app.js"]')) continue;
    const config = JSON.parse(el.querySelector('[data-vote-config]').textContent);
    config.primaryLink = row => safeLink(row.href);
    const table = el.querySelector('[data-datatable]') || el;
    const decorate = () => {
      for (const cell of el.querySelectorAll('td[data-label="Outcome"]')) {
        if (cell.querySelector('.ui-status')) continue;
        const value = cell.querySelector('.dt-value') || cell;
        const word = value.textContent.trim();
        value.innerHTML = statusLabelHTML(word, word === 'Agreed' ? 'done' : 'ended');
      }
    };
    const observer = new MutationObserver(decorate);
    const handle = mountDataTable(table, config);
    decorate(); observer.observe(el, {childList:true, subtree:true});
    mounted.set(el, {destroy() {observer.disconnect(); handle.destroy();}});
  }
}
if (typeof document !== 'undefined') {
  const boot = () => {
    mountVoteTables();
    // The app replaces whole panels; disconnected mounts must abort their fetches.
    new MutationObserver(() => mountVoteTables()).observe(document.body, {childList:true, subtree:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
}
