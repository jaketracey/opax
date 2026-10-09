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

/** One availability rule for navigation, SSR and crawl discovery. */
export function reconciledCounts(m) {
  const count=m?.count, exported=m?.exported ?? count, gap=m?.unresolved_gap ?? 0, pages=m?.gap_pages ?? [];
  const start=m?.count_start, end=m?.count_end, drift=m?.drift, tail=m?.tail_sweep;
  return Number.isInteger(count) && count > 0 && Number.isInteger(exported) && exported > 0
    && Number.isInteger(start) && start > 0 && end === count && Number.isInteger(drift)
    && drift === end-start && Math.abs(drift) <= 50 && tail?.complete === true
    && ['requests','pages','prefix_pages','fetched','rounds'].every(k=>Number.isInteger(tail[k]) && tail[k]>=0)
    && tail.requests <= 300 && tail.pages <= tail.requests && tail.prefix_pages <= tail.pages
    && tail.fetched <= tail.requests && tail.rounds <= 3
    && Number.isInteger(gap) && gap >= 0 && gap <= 10 && gap * 2000 <= count && exported + gap >= count
    && Array.isArray(pages) && pages.every(p=>p && Number.isInteger(p.offset) && p.offset >= 0
      && p.offset % 100 === 0 && p.offset < count && Number.isInteger(p.unresolved_gap)
      && p.unresolved_gap > 0 && p.unresolved_gap <= Math.min(100,count-p.offset))
    && new Set(pages.map(p=>p.offset)).size === pages.length
    && pages.reduce((n,p)=>n+p.unresolved_gap,0) === gap;
}
export function catalogueComplete(m) {
  if (!m || m.complete !== true || m.metadata_only !== true
    || m.scope !== "collection eq 'LegislativeInstrument' and isInForce eq true"
    || !reconciledCounts(m) || m.count !== m.odata_count
    || m.metadata_coverage?.expanded_titles !== (m.exported ?? m.count)
    || !Array.isArray(m.metadata_coverage?.missing_expansion_ids)
    || m.metadata_coverage.missing_expansion_ids.length
    || !m.lookup || !Array.isArray(m.chunks) || !m.chunks.length
    || m.index_url !== '/instruments/index.json' || !Array.isArray(m.schemas)
    || typeof m.generated_at !== 'string' || !Number.isFinite(Date.parse(m.generated_at))
    || !/^\d{4}-\d{2}-\d{2}T/.test(m.generated_at)
    || new Date(m.generated_at.slice(0,10) + 'T00:00:00Z').toISOString().slice(0,10) !== m.generated_at.slice(0,10)
    || !m.attribution || m.attribution.licence_url !== 'https://creativecommons.org/licenses/by/4.0/'
    || !m.facets || !['portfolio','type','status','commencement_year'].every(k => Array.isArray(m.facets[k]))) return false;
  const ids = Object.keys(m.lookup);
  return ids.length === (m.exported ?? m.count) && ids.every(id => FRL_ID.test(id)
    && Number.isInteger(m.lookup[id]) && m.lookup[id] >= 0 && m.lookup[id] < m.chunks.length)
    && m.chunks.every(c => c && /^\/instruments\/catalogue-[a-z0-9-]+\.json$/.test(c.path)
      && Number.isInteger(c.count) && c.count > 0 && c.count <= 512)
    && m.chunks.reduce((n,c) => n + c.count, 0) === (m.exported ?? m.count);
}
