export const AUDIT_ID = /^qao-\d{4}(?:-\d{2})?-\d+$/;
export function auditComplete(m) {
  return m?.schema === 1 && m.complete === true && m.phase === 1 && Number.isInteger(m.count) && m.count > 0
    && m.count === m.listed && Object.keys(m.lookup || {}).length === m.count
    && Object.keys(m.lookup).every(id => AUDIT_ID.test(id) && Number.isInteger(m.lookup[id]) && m.chunks?.[m.lookup[id]])
    && Array.isArray(m.chunks) && m.chunks.every(c => /^\/audit\/reports-\d+\.json$/.test(c.path) && Number.isInteger(c.count) && c.count > 0)
    && m.chunks.reduce((n,c) => n + c.count, 0) === m.count
    && m.attribution?.licence_url === 'https://creativecommons.org/licenses/by/4.0/';
}
export function filterAudit(rows, params) {
  const q = (params.get('q') || '').trim().toLocaleLowerCase('en-AU');
  return rows.filter(r => (!q || r.title.toLocaleLowerCase('en-AU').includes(q))
    && (!params.get('year') || r.year === params.get('year'))
    && (!params.get('sector') || r.sectors.includes(params.get('sector')))
    && (!params.get('entity') || r.entities.includes(params.get('entity'))));
}
