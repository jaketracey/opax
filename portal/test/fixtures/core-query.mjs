// Unmodified query exports from the shared core at 42d7727e.
// Used only while this rollout branch carries the public stub; the merged
// integration test imports the actual public module.
const prefix = key => key ? `${key}.` : '';
const integer = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const collator = new Intl.Collator('en-AU', {numeric:true, sensitivity:'base'});
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
