// Query privacy precedes grammar parsing: retain every occurrence and unknown key.
const decimal = new Intl.NumberFormat('en-AU', {maximumFractionDigits:20});
export function* queryValues(input) {
  if (typeof input === 'string' || typeof input === 'boolean') yield String(input);
  else if (typeof input === 'number') yield decimal.format(input).replaceAll(',', '');
  else if (Array.isArray(input)) for (const value of input) yield* queryValues(value);
  else if (input && typeof input === 'object') for (const [key,value] of Object.entries(input)) {
    yield key; yield* queryValues(value);
  }
}
export function* queryEntryValues(key, value) {
  // JSON escapes and numeric exponent notation must not hide an identity.
  for (const raw of [key,value]) {
    yield raw;
    try { yield* queryValues(JSON.parse(raw)); } catch { /* Still check the raw text. */ }
  }
}
export function* rawQueryValues(params) {
  for (const [key,value] of params) yield* queryEntryValues(key,value);
}
function tableQueryKey(key, urlKey) {
  return /^(?:q|sort|page|pageSize|f\..+)$/.test(key) || (urlKey === null
    ? /^.+\.(?:q|sort|page|pageSize|f\..+)$/.test(key)
    : Boolean(urlKey && key.startsWith(urlKey+'.') && /^(?:q|sort|page|pageSize|f\..+)$/.test(key.slice(urlKey.length+1))));
}
export function repeatedTableKeys(params, urlKey = '') {
  const repeated = new Set(), seen = new Set();
  for (const key of params.keys()) {
    if (!tableQueryKey(key,urlKey)) continue;
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return repeated;
}
// Rebuild pairs rather than deleting by key: safe unrelated occurrences survive.
export function scrubQuery(params, safe, urlKey = '') {
  const repeated = repeatedTableKeys(params,urlKey), clean = new URLSearchParams();
  let rejected = repeated.size > 0;
  for (const [key,value] of params) {
    const passed = [...queryEntryValues(key,value)].map(safe).every(Boolean);
    if (!passed) rejected = true;
    if (passed && !repeated.has(key)) clean.append(key,value);
  }
  // Capture the raw state: rejection must remain noindex after unsafe pairs vanish.
  const noindex = rejected || [...params.keys()].some(key=>tableQueryKey(key,urlKey));
  return {params:clean,rejected,noindex};
}
