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
export function repeatedTableKeys(params, urlKey = '') {
  const repeated = new Set(), seen = new Set();
  for (const key of params.keys()) {
    const field = /^(?:q|sort|page|pageSize|f\..+)$/.test(key);
    const scoped = urlKey === null ? /^.+\.(?:q|sort|page|pageSize|f\..+)$/.test(key)
      : urlKey && key.startsWith(urlKey+'.') && /^(?:q|sort|page|pageSize|f\..+)$/.test(key.slice(urlKey.length+1));
    if (!field && !scoped) continue;
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
  return {params:clean,rejected};
}
