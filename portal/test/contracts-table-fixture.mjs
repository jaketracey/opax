// Local preview only. DT-api replaces this fixture at the same endpoint.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {contractRows, contractsTableConfig, compileContractGuard} from '../public/contracts-table.js';
import {toCSV} from '../public/datatable.js';
import {MONEY_GRAPHS, withheldPhrases, namesWithheldPhrase} from '../public/donor-entity.js';

export function contractsFixture(root) {
  const read = path => JSON.parse(readFileSync(join(root, path.replace(/^\//, '')), 'utf8'));
  const graphs = MONEY_GRAPHS.map(read);
  const roster = read('/parliamentarians.json');
  const access = read('/access.json');
  const phrases = withheldPhrases(graphs, [...roster.people.flatMap(p => [p.name, p.full]), ...Object.values(access.ministers || {}).map(m => m.name)].filter(Boolean));
  const withheld = compileContractGuard(phrases);
  const index = read('/suppliers.json');
  const shards = new Map();
  const profile = supplier => {
    if (!shards.has(supplier.profile_path)) shards.set(supplier.profile_path, read(supplier.profile_path));
    return shards.get(supplier.profile_path).profiles[supplier.id];
  };
  let all;
  return url => {
    const params = url.searchParams;
    const supplierId = params.get('supplier');
    const config = contractsTableConfig({supplierId});
    const size = Math.max(1, Math.min(2000, Number(params.get('pageSize')) || 50));
    const privateQuery = withheld(...[...params.values()]);
    if (privateQuery) return params.get('format') === 'csv'
      ? new Response(toCSV([], config), {headers: {'content-type': 'text/csv; charset=utf-8'}})
      : Response.json({rows: [], total: 0, page: 1, pageSize: size, facets: {}});
    let rows;
    if (supplierId) {
      const entry = index.suppliers.find(s => s.id === supplierId);
      rows = entry ? contractRows(profile(entry).contracts, withheld) : [];
    } else {
      all ??= index.suppliers.flatMap(s => contractRows(profile(s).contracts.map(c => ({...c, supplier_id: s.id})), withheld));
      rows = all;
    }
    const q = (params.get('q') || '').toLocaleLowerCase('en-AU');
    rows = rows.filter(r => !q || config.columns.some(c => String(r[c.key] || '').toLocaleLowerCase('en-AU').includes(q)));
    for (const column of config.columns) {
      let filter;
      try {filter = JSON.parse(params.get(`f.${column.key}`) || 'null');} catch {continue;}
      if (Array.isArray(filter)) rows = rows.filter(r => !filter.length || filter.includes(String(r[column.key])));
      else if (filter && typeof filter === 'object') rows = rows.filter(r =>
        (filter.min == null || Number(r[column.key]) >= filter.min) && (filter.max == null || Number(r[column.key]) <= filter.max));
    }
    const [key, dir] = (params.get('sort') || `${config.defaultSort.key}:${config.defaultSort.dir}`).split(':');
    const column = config.columns.find(c => c.key === key);
    if (column) rows = [...rows].sort((a, b) => (['money','count'].includes(column.type)
      ? Number(a[key]) - Number(b[key]) : String(a[key] || '').localeCompare(String(b[key] || ''))) * (dir === 'desc' ? -1 : 1));
    if (params.get('format') === 'csv') return new Response(toCSV(rows.slice(0, 50000), config), {headers: {'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="contracts.csv"'}});
    const facets = {};
    for (const column of config.columns.filter(c => c.facet)) {
      if (column.type === 'category') {
        const counts = new Map();
        for (const row of rows) counts.set(row[column.key], (counts.get(row[column.key]) || 0) + 1);
        facets[column.key] = [...counts].map(([value, count]) => ({value, count}));
      } else if (rows.length) {
        const values = rows.map(r => Number(r[column.key]));
        facets[column.key] = {min: Math.min(...values), max: Math.max(...values)};
      }
    }
    const page = Math.max(1, Math.min(Math.ceil(rows.length / size) || 1, Number(params.get('page')) || 1));
    return Response.json({rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageSize: size, facets});
  };
}
