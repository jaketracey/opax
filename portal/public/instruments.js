/** Decode the bounded metadata export; no names become person entities. */
export const FRL_ID = /^[CF]\d{4}[A-Z]\d{5}$/;
export function unpack(value, schemas, strings = []) {
  if (Array.isArray(value)) return value.map(v => unpack(v, schemas, strings));
  if (value && typeof value === 'object') {
    if ('s' in value) {
      if (!Number.isInteger(value.s) || typeof strings[value.s] !== 'string') throw new Error('Invalid instrument metadata string');
      return strings[value.s];
    }
    const fields = schemas[value.o];
    if (!fields || fields.length !== value.v?.length) throw new Error('Invalid instrument metadata schema');
    return Object.fromEntries(fields.map((k, i) => [k, unpack(value.v[i], schemas, strings)]));
  }
  return value;
}
export function filterInstruments(records, params) {
  const title = (params.get('q') || '').trim().toLocaleLowerCase('en-AU');
  const portfolio = params.get('portfolio'), type = params.get('type');
  const year = params.get('year'), status = params.get('status');
  return records.filter(r => (!title || r[1].toLocaleLowerCase('en-AU').includes(title))
    && (!portfolio || (portfolio === 'unknown' ? !r[2].length : r[2].includes(portfolio)))
    && (!type || r[3] === type) && (!status || r[5] === status)
    && (!year || (r[4]?.slice(0,4) || 'unknown') === year));
}
