// Unit fixture only. The browser gate uses the real D1 API.
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {contractRows, contractsTableConfig} from '../public/contracts-table.js';
import {toCSV, applyQuery, parseQuery} from '../public/datatable.js';

export function contractsFixture(root) {
  const read = path => JSON.parse(readFileSync(join(root, path.replace(/^\//, '')), 'utf8'));
  const index = read('/suppliers.json');
  const shards = new Map();
  const profile = supplier => {
    if (!shards.has(supplier.profile_path)) shards.set(supplier.profile_path, read(supplier.profile_path));
    return shards.get(supplier.profile_path).profiles[supplier.id];
  };
  let all;
  return async url => {
    const params = url.searchParams;
    const supplierId = params.get('supplier');
    const config = contractsTableConfig({supplierId});
    const size = Math.max(1, Math.min(2000, Number(params.get('pageSize')) || 50));
    let rows;
    if (supplierId) {
      const entry = index.suppliers.find(s => s.id === supplierId);
      rows = entry ? contractRows(profile(entry).contracts.map(c=>({...c,recipient:profile(entry),supplier_id:entry.id}))) : [];
    } else {
      all ??= contractRows(index.suppliers.flatMap(s => profile(s).contracts.map(c => ({...c, recipient:profile(s),supplier_id: s.id}))));
      rows = all;
    }
    const query = {...parseQuery(params), pageSize: size};
    const page = applyQuery(rows, config, query);
    if (params.get('format') !== 'csv') return Response.json(page);
    const filtered = applyQuery(rows, config, {...query, page: 1, pageSize: 50001}).rows;
    const truncated = filtered.length > 50000;
    return new Response(toCSV(filtered.slice(0, 50000), config) + (truncated ? '\r\n# Export truncated at 50,000 rows.' : ''), {
      headers: {'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="contracts.csv"', ...(truncated ? {'x-table-export-truncated': 'true'} : {})},
    });
  };
}
