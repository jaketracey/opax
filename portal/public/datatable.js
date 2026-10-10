// DataTable: STUB for rollout lanes until lane DT-core merges (see docs/design/datatable.contract.md).
// Minimal, contract-shaped behaviour so pages render; DT-core replaces this file wholesale.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function formatCell(value, column) { return value == null ? '' : String(value); }
export function applyQuery(rows, config, query = {}) { const pageSize = query.pageSize || config.pageSize || 50; const page = query.page || 1; return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }; }
export function toCSV(rows, config) { const keys = config.columns.map(c => c.key); return [config.columns.map(c => c.label).join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n'); }
export function parseQuery() { return {}; }
export function serializeQuery() { return ''; }
export function dataTableHTML(config, page) { return `<table class="dt" id="${esc(config.id)}"><caption>${esc(config.caption)}</caption><thead><tr>${config.columns.map(c => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${page.rows.map(r => `<tr>${config.columns.map(c => `<td>${esc(formatCell(r[c.key], c))}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
export function mountDataTable() { return { destroy() {} }; }
