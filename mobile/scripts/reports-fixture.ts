// Synthetic API response contracts projected only from pinned OPAX exports.
// No production requests or invented quotations. These are NOT live index
// totals: topics absent from the six reports have zero in this fixture, party
// counts cover the report's ranked voices, and the arc is its source window.
import { Buffer } from 'node:buffer';
import {
  arcPath,
  allSources,
  decodeReport,
  reportSlugs,
  topicNames,
  topicReport,
} from '../src/features/reports/model';
import { decodeCorpus } from '../src/api/catalog-decoders';

export function reportsFixture(bytes: (path: string) => Buffer) {
  const corpus = decodeCorpus(JSON.parse(bytes('/corpus.json').toString()));
  const reports = Object.fromEntries(
    reportSlugs.map((slug) => [
      slug,
      decodeReport(JSON.parse(bytes(`/reports/${slug}.json`).toString())),
    ]),
  );
  const topics = Object.keys(topicNames).map((slug) => ({
    slug,
    count: reports[topicReport[slug] ?? '']?.stats?.speech_count ?? 0,
  }));
  const labelled = topics.reduce((sum, t) => sum + t.count, 0);
  const byTopic = Object.fromEntries(
    topics.map(({ slug, count }) => {
      const report = reports[topicReport[slug] ?? ''];
      const parties = new Map<string, number>();
      for (const v of report?.voices?.all ?? [])
        if (v.party)
          parties.set(v.party, (parties.get(v.party) ?? 0) + v.count);
      const sources = report ? allSources(report) : [];
      const states = new Map<string, number>();
      for (const s of sources)
        if (s.state) states.set(s.state, (states.get(s.state) ?? 0) + 1);
      return [
        slug,
        {
          slug,
          count,
          labelled,
          parties: [...parties],
          states: [...states].map(([state, n]) => [
            state,
            n,
            sources.length ? n / sources.length : 0,
          ]),
        },
      ];
    }),
  );
  const spans = [
    { slug: '1990s', label: '1993–99', from: 1993, to: 1999 },
    { slug: '2000s', label: '2000s', from: 2000, to: 2009 },
    { slug: '2010s', label: '2010s', from: 2010, to: 2019 },
    { slug: '2020s', label: '2020–26', from: 2020, to: 2026 },
  ];
  const decades = spans.map((d, i) => {
    const n = reports.gambling!.over_time!.tide[i]!.labelled!;
    return { ...d, total: n, labelled: n, coverage: 1 };
  });
  const tideTopics = Object.fromEntries(
    topics.map(({ slug }) => [
      slug,
      spans.map((d, i) => {
        const point = reports[topicReport[slug] ?? '']?.over_time?.tide[i];
        return {
          decade: d.slug,
          count: point?.count ?? 0,
          share: point?.share ?? 0,
        };
      }),
    ]),
  );
  const result = new Map<string, Buffer>();
  const put = (path: string, data: unknown) =>
    result.set(path, Buffer.from(JSON.stringify(data)));
  put('/api/topics', { labelled, topics });
  put('/api/tide', { scope: 'federal', decades, topics: tideTopics });
  for (const [slug, data] of Object.entries(byTopic)) {
    put(`/api/topic/${slug}`, data);
    const report = reports[topicReport[slug] ?? ''];
    put(arcPath(slug), {
      results: (report ? allSources(report) : [])
        .filter((s) => s.slug.startsWith('speech-'))
        .map((s) => ({
          ...s,
          title: s.title ?? s.slug,
          snippet: s.passage ?? '',
        })),
    });
  }
  const kinds = corpus.refresh.resource_counts;
  put('/api/stats', {
    resources: Object.values(kinds).reduce((n, v) => n + v, 0),
    paragraphs: corpus.expected_resources,
    kinds,
    speeches_by_state: { federal: corpus.collected_speeches },
  });
  const cells = Object.fromEntries(
    Object.entries(byTopic).map(([slug, data]) => [
      slug,
      Object.fromEntries(data.parties),
    ]),
  );
  put('/api/matrix', {
    labelled,
    parties: [
      ...new Set(
        Object.values(byTopic).flatMap((d) => d.parties.map(([p]) => p)),
      ),
    ],
    cells,
    totals: Object.fromEntries(topics.map((t) => [t.slug, t.count])),
  });
  return (path: string) => {
    if (result.has(path)) return result.get(path);
    if (!path.startsWith('/api/search?')) return undefined;
    const params = new URLSearchParams(path.split('?')[1]);
    const base = result.get(arcPath(params.get('topic')!));
    if (!base) return undefined;
    const data = JSON.parse(base.toString()) as {
      results: Array<{
        party?: string;
        state?: string;
        date?: string;
        title: string;
      }>;
    };
    return Buffer.from(
      JSON.stringify({
        results: data.results.filter(
          (s) =>
            (!params.has('party') || s.party === params.get('party')) &&
            (!params.has('state') || s.state === params.get('state')) &&
            (!params.has('from') ||
              (s.date ?? '').slice(0, 4) >= params.get('from')!) &&
            (!params.has('to') ||
              (s.date ?? '').slice(0, 4) <= params.get('to')!),
        ),
      }),
    );
  };
}
