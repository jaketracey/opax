// Server dataset columns. The shared DataTable contract stays unchanged.
const text = (key, label = key) => ({key, label, type: 'text'});
const category = (key, label = key) => ({key, label, type: 'category', facet: 'multi'});
const number = (key, type = 'count', label = key) => ({key, label, type, facet: 'range'});
const date = (key, label = key) => ({key, label, type: 'date'});
const jurisdiction = category('jurisdiction');
const money = [text('id'), text('from'), text('to'), category('type'), jurisdiction, category('industry'), number('amount', 'money', 'Value'), number('count', 'count', 'Records'), number('firstYear', 'year', 'First year'), number('lastYear', 'year', 'Last year'), ...['return_reference','from_href','to_href'].map(key=>({...text(key,key==='return_reference'?'Return reference':key),computed:true,sortable:false}))];
export const TABLE_DATASETS = {
  'money-connections': {columns: money, defaultSort: {key: 'amount', dir: 'desc'}},
  contracts: {columns: [text('id'), text('title'), text('supplier'), category('agency'), category('procurement_method', 'Method'), jurisdiction, number('amount', 'money', 'Value'), date('start_date', 'Start'), date('end_date', 'End'), text('description'), text('url', 'Source')], defaultSort: {key: 'amount', dir: 'desc'}},
  suppliers: {columns: [text('id'), text('name'), text('abn', 'Registration'), jurisdiction, number('total', 'money', 'Value'), number('count', 'count', 'Contracts'), number('agency_count', 'count', 'Agencies'), number('first_year', 'year', 'First year'), number('last_year', 'year', 'Last year')], defaultSort: {key: 'total', dir: 'desc'}},
  grants: {columns: [text('id'), text('title'), text('recipient'), category('agency'), category('program'), category('category'), jurisdiction, number('amount', 'money', 'Value'), number('year', 'year'), date('start_date', 'Start'), text('description'), text('url', 'Source')], defaultSort: {key: 'amount', dir: 'desc'}},
  divisions: {columns: [text('id'), text('title','Title'), date('date','Date'), category('chamber','Chamber'), category('outcome','Outcome'), number('ayes','count','Ayes'), number('noes','count','Noes'), text('href'), category('bill'), category('sitting'), text('name'), text('question'), jurisdiction, category('house'), category('result'), number('member_count', 'count', 'Members'), text('url', 'Source')], defaultSort: {key: 'date', dir: 'desc'}},
  votes: {columns: [text('id'), text('title','Bill or division'), date('date','Date'), category('vote','Vote'), category('party_position','Party position'), text('href'), category('person'), text('name'), category('party'), jurisdiction, category('house'), number('ayes'), number('noes'), number('divisions_total', 'count', 'Divisions'), number('first_year', 'year', 'First year'), number('last_year', 'year', 'Last year')], defaultSort: {key: 'date', dir: 'desc'}},
  instruments: {columns: [text('id'), text('title'), category('portfolios'), category('type'), category('status'), date('commenced'), number('year', 'year')], defaultSort: {key: 'title', dir: 'asc'}},
  'audit-reports': {columns: [text('id'), text('title'), text('report_label', 'Report'), category('sectors'), category('entities'), jurisdiction, number('number'), number('year', 'year'), date('tabled_date', 'Tabled'), text('canonical_url', 'Source')], defaultSort: {key: 'tabled_date', dir: 'desc'}},
  interests: {columns: [text('id'), text('name'), category('category'), category('holder'), jurisdiction, category('chamber'), text('description'), date('date'), number('year', 'year'), text('url', 'Source')], defaultSort: {key: 'name', dir: 'asc'}},
  'party-money': {columns: money, defaultSort: {key: 'amount', dir: 'desc'}},
};

export const tableText = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export const tableTerms = value => tableText(value).match(/[\p{L}\p{N}]+/gu) || [];
export function tableBucket(term) {
  let hash = 2166136261;
  for (const ch of term) hash = Math.imul(hash ^ ch.codePointAt(0), 16777619);
  return (hash >>> 0) % 16;
}
export function compareTableValues(a, b) {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return tableText(Array.isArray(a) ? a.join('; ') : a).localeCompare(tableText(Array.isArray(b) ? b.join('; ') : b), 'en');
}
