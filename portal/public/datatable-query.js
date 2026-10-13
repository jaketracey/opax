// Identify duplicate table query keys before grammar parsing.
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
