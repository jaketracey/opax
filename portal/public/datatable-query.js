// Identify duplicate table query keys before grammar parsing.
function tableQueryKey(key, urlKey) {
  const local = value => ['q','sort','page','pageSize'].includes(value) || value.startsWith('f.') && value.length>2 && !/[\r\n\u2028\u2029]/.test(value);
  if (local(key)) return true;
  if (urlKey !== null) return Boolean(urlKey && key.startsWith(urlKey+'.') && local(key.slice(urlKey.length+1)));
  if (/[\r\n\u2028\u2029]/.test(key)) return false;
  // A namespaced filter can contain further dots. Inspect delimiters once.
  const filter=key.indexOf('.f.',1), dot=key.lastIndexOf('.');
  return filter>0 && filter+3<key.length || dot>0 && local(key.slice(dot+1));
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
