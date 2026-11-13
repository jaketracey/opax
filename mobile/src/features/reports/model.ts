import {
  array,
  count,
  date,
  dict,
  nonempty,
  number,
  object,
  optional,
  shape,
  text,
  boolean,
  nullable,
  invalid,
  type Decoder,
} from '../../api/validation';
import topicsCopy from './topics-copy.json';
import { partyFromCode } from '../bills/party-codes';
import { parties as searchParties } from '../search/web-options';
function tuple<D extends readonly Decoder<unknown>[]>(...decoders: D) {
  return (v: unknown): { [K in keyof D]: ReturnType<D[K]> } => {
    if (!Array.isArray(v) || v.length !== decoders.length) invalid();
    return decoders.map((decode, i) => decode(v[i])) as {
      [K in keyof D]: ReturnType<D[K]>;
    };
  };
}

export const topicNames: Readonly<Record<string, string>> = topicsCopy.names;
export const topicDescriptions: Readonly<Record<string, string>> =
  topicsCopy.descriptions;
export const reportSlugs = [
  'climate',
  'gambling',
  'housing',
  'immigration',
  'indigenous',
  'media',
] as const;
/** "speeches about {phrase}": lower case except proper nouns. */
export const topicPhrase = (slug: string): string =>
  (topicsCopy.phrases as Record<string, string>)[slug] ??
  (topicNames[slug] ?? slug).toLowerCase().replace(/ & /g, ' and ');
/** The donations section title for the eight topics with an industry. */
export const topicMoneyTitles: Readonly<Record<string, string>> =
  topicsCopy.money;
export const topicReport: Readonly<Record<string, string>> = {
  gambling: 'gambling',
  housing: 'housing',
  'climate-environment': 'climate',
  immigration: 'immigration',
  'indigenous-affairs': 'indigenous',
  'media-communications': 'media',
};
export const moneyPairings: Readonly<
  Record<string, { topic: string; industries: string[]; label: string }>
> = {
  gambling: {
    topic: 'gambling',
    industries: ['gambling'],
    label: 'gambling industry',
  },
  housing: {
    topic: 'property-construction',
    industries: ['property'],
    label: 'property and construction',
  },
  climate: {
    topic: 'mining-energy',
    industries: ['mining', 'fossil_fuels'],
    label: 'mining and energy',
  },
  media: {
    topic: 'media-communications',
    industries: ['media'],
    label: 'media and technology',
  },
};
export const parliamentNames: Readonly<Record<string, string>> = {
  federal: 'Federal Parliament',
  nsw: 'NSW Parliament',
  vic: 'Victorian Parliament',
  sa: 'South Australian Parliament',
  qld: 'Queensland Parliament',
  act: 'ACT Legislative Assembly',
  tas: 'Tasmanian Parliament',
  wa: 'Western Australian Parliament',
  nt: 'Northern Territory Parliament',
};
const slug = (value: unknown) => {
  const s = nonempty(value);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))
    throw new Error('Invalid record slug');
  return s;
};
export const decodeSource = shape({
  slug,
  title: optional(text),
  source_title: optional(text),
  speaker: optional(text),
  party: optional(text),
  state: optional(text),
  date: optional(date),
  passage: optional(text),
  cited: optional(boolean),
  answer_ranges: optional(array(tuple(count, count))),
});
export type Source = ReturnType<typeof decodeSource>;
const essay = shape({
  question: nonempty,
  answer: text,
  sources: array(decodeSource),
  label: optional(text),
  from: optional(date),
  to: optional(date),
});
export type Essay = ReturnType<typeof essay>;
const tidePoint = shape({
  decade: nonempty,
  count,
  share: number,
  labelled: optional(count),
});
const voice = shape({ speaker: nonempty, party: optional(text), count });
export const decodeReportIndex = shape({
  reports: array(shape({ slug, title: nonempty, blurb: text, updated: date })),
});
export const decodeReport = shape({
  slug,
  title: nonempty,
  blurb: text,
  generated_at: date,
  version: optional(count),
  lede: optional(shape({ text, sources: array(decodeSource) })),
  now: optional(
    shape({
      since: date,
      discovered: array(
        shape({
          title: nonempty,
          count,
          search: optional(text),
          first: optional(date),
          last: optional(date),
        }),
      ),
      sections: array(essay),
    }),
  ),
  over_time: optional(
    shape({
      eras: array(essay),
      tide: array(tidePoint),
      key_moments: array(decodeSource),
    }),
  ),
  sections: optional(array(essay)),
  key_stats: optional(
    array(
      shape({
        value: text,
        label: nonempty,
        detail: optional(text),
        as_of: optional(text),
        slug: optional(slug),
        source_title: optional(text),
      }),
    ),
  ),
  positions: optional(
    array(
      shape({
        party: nonempty,
        position: text,
        speaker: optional(text),
        date: optional(date),
        slug: optional(slug),
        source_title: optional(text),
      }),
    ),
  ),
  voices: optional(shape({ now: array(voice), all: array(voice) })),
  stats: optional(
    shape({
      speech_count: count,
      unique_speakers: count,
      speech_scope: optional(text),
      timeline: array(tuple(text, count)),
      donations: optional(
        shape({
          total: number,
          count,
          industries: array(text),
          top_donors: array(tuple(text, number)),
          by_year: array(tuple(text, number)),
        }),
      ),
    }),
  ),
});
export type Report = ReturnType<typeof decodeReport>;
export const decodeTopics = shape({
  labelled: count,
  topics: array(shape({ slug, count })),
});
export const decodeTopic = shape({
  slug,
  count,
  labelled: count,
  parties: array(tuple(nonempty, count)),
  states: array(tuple(nonempty, count, number)),
});
export const decodeTide = shape({
  scope: nonempty,
  decades: array(
    shape({
      slug,
      label: nonempty,
      from: count,
      to: count,
      total: count,
      labelled: count,
      coverage: number,
    }),
  ),
  topics: dict(array(tidePoint)),
});
export const decodeStats = shape({
  resources: count,
  paragraphs: count,
  kinds: nullable(dict(count)),
  speeches_by_state: nullable(dict(count)),
});
export const decodeMatrix = shape({
  labelled: count,
  parties: array(nonempty),
  cells: dict(dict(count)),
  totals: dict(count),
});
export const decodeIndustryMoney = shape({
  meta: shape({
    generated: date,
    source: nonempty,
    coverage: nonempty,
    methodology: nonempty,
    exclusions: array(text),
  }),
  nodes: array(
    shape({
      id: nonempty,
      label: nonempty,
      kind: nonempty,
      industry: optional(text),
      group: optional(text),
      aliases: optional(array(text)),
      total: number,
      count,
    }),
  ),
  edges: array(
    shape({ source: nonempty, target: nonempty, total: number, count }),
  ),
});
export type IndustryMoney = ReturnType<typeof decodeIndustryMoney>;
export const decodeSpeeches = (v: unknown) => {
  const row = object(v);
  return {
    results: array(
      shape({
        slug,
        title: nonempty,
        date: optional(date),
        speaker: optional(text),
        party: optional(text),
        state: optional(text),
        snippet: optional(text),
        resource: optional(text),
      }),
    )(row.results),
  };
};
export type SpeechFilters = {
  party?: string;
  state?: string;
  from?: string;
  to?: string;
  debate?: string;
};
export function decadeWindow(
  label: string,
): { from: string; to: string } | null {
  const decade = /^(\d{4})s$/.exec(label);
  const span = /^(\d{4})[–-](\d{2}|\d{4})$/.exec(label);
  const from = decade?.[1] ?? span?.[1];
  if (!from) return null;
  const to = decade
    ? String(Number(from) + 9)
    : span![2]!.length === 2
      ? from.slice(0, 2) + span![2]
      : span![2]!;
  return Number(from) >= 1993 && Number(to) <= 2026 && from <= to
    ? { from, to }
    : null;
}
/** A decade bar of `/api/tide`: its label and inclusive years. */
export interface DecadeBucket {
  slug: string;
  label: string;
  from: number;
  to: number;
}
/** The tide's buckets, for arrivals read before the tide has loaded. */
export const defaultDecades: readonly DecadeBucket[] = [
  { slug: '1990s', label: '1993–99', from: 1993, to: 1999 },
  { slug: '2000s', label: '2000s', from: 2000, to: 2009 },
  { slug: '2010s', label: '2010s', from: 2010, to: 2019 },
  { slug: '2020s', label: '2020–26', from: 2020, to: 2026 },
];
const FIRST_YEAR = 1993;
const LAST_YEAR = 2026;
const yearOf = (value: string | undefined) => {
  const year = /^(\d{4})(?:-\d{2}-\d{2})?$/.exec(value?.trim() ?? '')?.[1];
  return year ? Number(year) : null;
};
/**
 * A topic page's filters as page state (specs/search.md 5.2.1): years from
 * a link become plain years; years outside the record, or `from` after
 * `to`, are both dropped; an unknown parliament is dropped. A `from` and
 * `to` that match a tide bucket choose that decade.
 */
export function normaliseTopicFilters(
  params: Record<string, string | string[] | undefined>,
): SpeechFilters {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };
  const out: SpeechFilters = {};
  const party = one('party');
  if (party && isKnownParty(party)) out.party = party;
  const state = one('state');
  if (state && parliamentNames[state]) out.state = state;
  const debate = one('debate');
  if (debate && debate.length <= 200) out.debate = debate;
  const from = yearOf(one('from'));
  const to = yearOf(one('to'));
  const inRange = (y: number | null) =>
    y === null || (y >= FIRST_YEAR && y <= LAST_YEAR);
  if (
    (from !== null || to !== null) &&
    inRange(from) &&
    inRange(to) &&
    !(from !== null && to !== null && from > to)
  ) {
    if (from !== null) out.from = String(from);
    if (to !== null) out.to = String(to);
  }
  return out;
}
/** The decade bucket the filters' years match exactly, if any. */
export function chosenDecade(
  filters: SpeechFilters,
  decades: readonly DecadeBucket[] = defaultDecades,
): DecadeBucket | null {
  return (
    decades.find(
      (d) => String(d.from) === filters.from && String(d.to) === filters.to,
    ) ?? null
  );
}
/** "Labor · Federal Parliament · 2010s", in the sheet's order. */
export function topicFiltersLine(
  filters: SpeechFilters,
  decades: readonly DecadeBucket[] = defaultDecades,
): string {
  const decade = chosenDecade(filters, decades);
  const years = decade
    ? decade.label
    : filters.from && filters.to
      ? `From ${filters.from} to ${filters.to}`
      : filters.from
        ? `From ${filters.from}`
        : filters.to
          ? `To ${filters.to}`
          : null;
  return [
    filters.party ? partyName(filters.party) : null,
    filters.state ? parliamentNames[filters.state] : null,
    years,
    filters.debate ? `“${filters.debate}”` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function arcPath(slug: string, filters: SpeechFilters = {}) {
  if (!topicNames[slug]) throw new Error('Unknown topic');
  const params = new URLSearchParams({
    q: filters.debate || topicPhrase(slug),
    kind: 'speech',
    mode: 'hybrid',
    page: '1',
    per: '200',
    sort: 'newest',
    topic: slug,
  });
  for (const key of ['party', 'state', 'from', 'to'] as const) {
    const value = filters[key];
    if (value)
      params.set(
        key,
        key === 'from' || key === 'to' ? value.slice(0, 4) : value,
      );
  }
  return `/api/search?${params}`;
}
// The party names design/party.ts knows, read the other way: the speech
// facet's dense codes ("ALP", "IND") back to the name a label draws.
/**
 * A party as a topic's counts give it, said as its name: "ALP" is Labor,
 * "IND" Independent. Names and unknown codes are kept exactly as recorded.
 */
export const partyName = (party: string): string => partyFromCode(party);

// A party code as the reads and the Who rows carry it ("ALP", "SFF").
const PARTY_CODE = /^[A-Z][A-Z0-9]{1,5}$/;
const partyNames = new Set<string>(searchParties);
/**
 * A party a topic arrival may filter by (specs/search.md 5.2.1): any party
 * code by its shape, or a full name the web sends (the search party list).
 * Anything else is link text, dropped before the filter line prints it.
 */
export const isKnownParty = (party: string) =>
  PARTY_CODE.test(party) || partyNames.has(party);
/**
 * A report section's heading and its opening sentence. The heading is the
 * section's short name where the export gives one (an era's "1993–2009");
 * otherwise the question's first sentence. Whatever the heading leaves out
 * of the question is said first in the body, so nothing is dropped.
 */
export function sectionHeading(item: Pick<Essay, 'question' | 'label'>): {
  heading: string;
  lead: string | null;
} {
  const question = item.question.trim();
  const label = item.label?.trim();
  if (label) return { heading: label, lead: question };
  const end = /[?.!](?=\s)/.exec(question);
  if (!end) return { heading: question, lead: null };
  const rest = question.slice(end.index + 1).trim();
  return {
    heading: question.slice(0, end.index + 1),
    lead: rest || null,
  };
}
export function numberedSections(report: Report) {
  return [
    ...(report.now?.sections ?? report.sections ?? []).map((item) => ({
      item,
      tab: 'now' as const,
    })),
    ...(report.over_time?.eras ?? []).map((item) => ({
      item,
      tab: 'over' as const,
    })),
  ].map((section, i) => ({ ...section, number: i + 1 }));
}
export function allSources(report: Report): Source[] {
  const seen = new Map<string, Source>();
  const add = (rows: Source[]) =>
    rows.forEach((s) => {
      if (!seen.has(s.slug)) seen.set(s.slug, s);
    });
  add(report.lede?.sources ?? []);
  numberedSections(report).forEach((s) => add(s.item.sources));
  add(report.over_time?.key_moments ?? []);
  for (const item of [
    ...(report.positions ?? []),
    ...(report.key_stats ?? []),
  ]) {
    if (item.slug)
      add([
        {
          slug: item.slug,
          title: item.source_title,
          source_title: undefined,
          speaker: 'speaker' in item ? item.speaker : undefined,
          party: 'party' in item ? item.party : undefined,
          state: undefined,
          date: 'date' in item ? item.date : undefined,
          passage: undefined,
          cited: undefined,
          answer_ranges: undefined,
        },
      ]);
  }
  return [...seen.values()].sort((a, b) =>
    (a.date ?? '').localeCompare(b.date ?? ''),
  );
}
// Paragraphs remain verbatim. Citation ranges use Unicode code points (Python
// generator offsets), rather than JS UTF-16 offsets, and retain source numbers.
export function citedParagraphs(prose: string, sources: Source[]) {
  return citedBlocks(prose, sources, /\n\n/);
}
/** Short opening blocks, retaining each citation's original code-point range. */
export function ledeParagraphs(prose: string, sources: Source[]) {
  return citedBlocks(prose, sources, /(?<=[.!?])\s+(?=[\p{Lu}“"‘])|\n\n/u);
}
function citedBlocks(prose: string, sources: Source[], separator: RegExp) {
  let cursor = 0;
  return prose.split(separator).map((value) => {
    const offset = prose.indexOf(value, cursor);
    const start = Array.from(prose.slice(0, offset)).length;
    const end = start + Array.from(value).length;
    cursor = offset + value.length;
    const citations = sources.flatMap((source, i) => {
      const ranges = source.answer_ranges ?? [];
      return ranges.some(([a, b]) => a < end && b > start && b > a) ||
        new RegExp(`\\[${i + 1}\\]`).test(value)
        ? [i + 1]
        : [];
    });
    return { text: value, citations };
  });
}
export function moneyRows(
  money: IndustryMoney,
  industries: string[],
  matrix?: ReturnType<typeof decodeMatrix>,
  topic?: string,
) {
  const donors = money.nodes.filter(
    (n) => n.kind === 'donor' && industries.includes(n.industry ?? ''),
  );
  const ids = new Set(donors.map((n) => n.id));
  const amounts = new Map<string, number>();
  for (const edge of money.edges)
    if (ids.has(edge.source) && edge.target.startsWith('party:')) {
      const party = edge.target.slice(6);
      amounts.set(party, (amounts.get(party) ?? 0) + edge.total);
    }
  const cells = topic ? (matrix?.cells[topic] ?? {}) : {};
  const total = topic ? matrix?.totals[topic] : undefined;
  const names = [
    ...new Set([
      ...amounts.keys(),
      ...Object.keys(cells).filter((p) => p !== 'Other'),
    ]),
  ];
  return {
    donors: [...donors].sort((a, b) => b.total - a.total),
    total,
    rows: names
      .map((party) => ({
        party,
        money: amounts.get(party) ?? 0,
        count: cells[party],
        share:
          total && cells[party] !== undefined ? cells[party]! / total : null,
      }))
      .sort(
        (a, b) =>
          b.money - a.money ||
          (b.count ?? 0) - (a.count ?? 0) ||
          a.party.localeCompare(b.party),
      ),
  };
}
