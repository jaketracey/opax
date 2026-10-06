import { arcPath, reportSlugs, topicNames } from '../features/reports/model';
// Exact web requests, enabled by build 7 for reader-chosen screens only.
export function allowsReportsPath(path: string): boolean {
  if (
    [
      '/reports/index.json',
      '/api/topics',
      '/api/tide',
      '/api/stats',
      '/api/matrix',
    ].includes(path)
  )
    return true;
  if (reportSlugs.some((slug) => path === `/reports/${slug}.json`)) return true;
  if (Object.keys(topicNames).some((slug) => path === `/api/topic/${slug}`))
    return true;
  if (!path.startsWith('/api/search?')) return false;
  const params = new URLSearchParams(path.slice(path.indexOf('?') + 1));
  const topic = params.get('topic');
  if (!topic || !topicNames[topic]) return false;
  const parties = [
    'Labor',
    'Liberal',
    'Nationals',
    'Greens',
    'LNP',
    'Independent',
    'One Nation',
    'Country Liberal Party',
    'Centre Alliance',
    "Katter's Australian Party",
    'United Australia Party',
    'Family First',
    'Australian Democrats',
    'DLP',
    'JLN',
  ];
  if (params.has('party') && !parties.includes(params.get('party')!))
    return false;
  if (
    params.has('state') &&
    !['federal', 'nsw', 'vic', 'sa', 'qld', 'act', 'tas', 'wa', 'nt'].includes(
      params.get('state')!,
    )
  )
    return false;
  for (const key of ['from', 'to'])
    if (
      params.has(key) &&
      (!/^\d{4}$/.test(params.get(key)!) ||
        Number(params.get(key)) < 1993 ||
        Number(params.get(key)) > 2026)
    )
      return false;
  if (
    params.has('from') &&
    params.has('to') &&
    params.get('from')! > params.get('to')!
  )
    return false;
  const q = params.get('q');
  if (!q?.trim() || q.length > 2000) return false;
  const expected = new URLSearchParams(
    arcPath(topic, {
      debate: q,
      ...Object.fromEntries(
        ['party', 'state', 'from', 'to']
          .filter((k) => params.has(k))
          .map((k) => [k, params.get(k)!]),
      ),
    }).split('?')[1],
  );
  return (
    [...params.keys()].length === [...expected.keys()].length &&
    [...expected].every(
      ([key, value]) =>
        params.getAll(key).length === 1 && params.get(key) === value,
    )
  );
}
