// Offline-only contracts pinned from portal/src/index.ts and public/app.js.
import records from './fixtures/search/records.json';
import grants from './fixtures/search/grants.json';
import agencies from './fixtures/search/agencies.json';
import bills from './fixtures/search/bills.json';
import briefs from './fixtures/search/briefs.json';
import manifest from './fixtures/search/search-catalog-manifest.json';
import reports from './fixtures/search/reports-index.json';
import { decodeRecord } from '../src/features/search/decoders';
import type { Roster } from '../src/api/catalog-decoders';
import { typeLabel } from '../src/features/search/contracts';

export function searchFixture(
  url: URL,
  roster: Roster,
): { body: Buffer; contentType?: string } | null {
  const p = url.searchParams;
  const json = (data: unknown) => ({ body: Buffer.from(JSON.stringify(data)) });
  if (url.pathname === '/search-catalog/manifest.json') return json(manifest);
  if (url.pathname === '/reports/index.json') return json(reports);
  if (url.pathname === '/api/brief') {
    const map: Record<string, string> = {};
    for (const id of (p.get('rids') ?? '').split(','))
      if (Object.hasOwn(briefs, id))
        map[id] = briefs[id as keyof typeof briefs];
    return json({ briefs: map });
  }
  const kind = p.get('kind') ?? 'all';
  const isMore = ['grant', 'agency', 'report', 'party', 'bill'].includes(kind);
  if (
    !['/api/search', '/api/search-summary'].includes(url.pathname) &&
    !(url.pathname === '/api/search-all' && isMore)
  )
    return null;
  const catalog =
    kind === 'bill'
      ? bills
      : kind === 'grant'
        ? grants
        : kind === 'agency'
          ? agencies
          : kind === 'report'
            ? reports.reports.map((r) => ({
                kind,
                title: r.title,
                slug: r.slug,
                href: '/reports/' + r.slug,
                snippet: r.blurb,
                resource: '',
                date: r.updated.slice(0, 10),
                source: 'OPAX research reports',
              }))
            : kind === 'party'
              ? [
                  ...new Set(
                    roster.people
                      .map((r) => r.party)
                      .filter((v): v is string => !!v),
                  ),
                ].map((name) => ({
                  kind,
                  title: name,
                  slug:
                    'party-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  href: '/subject/party/' + encodeURIComponent(name),
                  resource: '',
                  snippet: name,
                  source: 'Parliamentary roster',
                }))
              : records;
  const terms = (p.get('q') ?? '')
    .toLowerCase()
    .replace(/["“”]/g, '')
    .trim()
    .split(/\s+/);
  const matches = catalog
    .map(decodeRecord)
    .filter(
      (r) =>
        (isMore || kind === 'all' || r.kind === kind) &&
        terms.every((t) =>
          (r.title + ' ' + r.snippet).toLowerCase().includes(t),
        ) &&
        (!p.get('party') || r.party === p.get('party')) &&
        (!p.get('speaker') || r.speaker === p.get('speaker')) &&
        (!p.get('state') || r.state === p.get('state')) &&
        (!p.get('from') ||
          (r.date || r.dateLabel || '').slice(0, 4) >= p.get('from')!) &&
        (!p.get('to') ||
          (r.date || r.dateLabel || '').slice(0, 4) <= p.get('to')!) &&
        (!p.get('topic') || p.get('topic') === 'housing'),
    );
  const window = matches.slice(0, 200);
  if (url.pathname === '/api/search-summary') {
    const reviewed = window.slice(0, 20);
    const sources = reviewed.map((r, i) => ({
      id: 's' + (i + 1),
      title: r.title,
      href: r.href || '/doc/' + r.slug,
      kind: r.kind,
      speaker: r.speaker,
      date: r.date,
      snippet: r.snippet,
      evidence: [r.snippet],
    }));
    const summary = sources.length
      ? {
          status: 'ready',
          points: [{ text: sources[0]!.snippet, source_ids: ['s1'] }],
          sources,
          reviewed_count: sources.length,
          partial: false,
        }
      : { status: 'empty', points: [], sources: [] };
    return {
      body: Buffer.from(`event: done\ndata: ${JSON.stringify(summary)}\n\n`),
      contentType: 'text/event-stream',
    };
  }
  const sort = p.get('sort') ?? 'relevance';
  window.sort((a, b) =>
    sort === 'newest'
      ? (b.date ?? '').localeCompare(a.date ?? '')
      : sort === 'oldest'
        ? (a.date ?? '').localeCompare(b.date ?? '')
        : sort === 'title_asc'
          ? a.title.localeCompare(b.title)
          : sort === 'title_desc'
            ? b.title.localeCompare(a.title)
            : sort === 'type'
              ? typeLabel(a.kind).localeCompare(typeLabel(b.kind))
              : 0,
  );
  const per = Number(p.get('per') ?? 20),
    pageCount = Math.max(1, Math.ceil(window.length / per)),
    page = Math.min(pageCount, Number(p.get('page') ?? 1));
  const rows = window.slice((page - 1) * per, page * per);
  const years: Record<string, number> = {};
  for (const r of window) {
    const y = r.date?.slice(0, 4);
    if (y) years[y] = (years[y] ?? 0) + 1;
  }
  return json({
    query: p.get('q'),
    kind,
    mode: p.get('mode') ?? 'hybrid',
    sort,
    page,
    per_page: per,
    page_count: pageCount,
    total: window.length,
    count: rows.length,
    results: rows,
    truncated: matches.length > 200,
    years,
    warnings: [],
    coverage:
      'Pinned public source extracts; local fixture matching, not production retrieval or ranking.',
  });
}
