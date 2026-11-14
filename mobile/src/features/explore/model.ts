import type { RecordResult } from '../../api/client';
import {
  array,
  boolean,
  count,
  date,
  invalid,
  nonempty,
  nullable,
  object,
  optional,
  shape,
  text,
} from '../../api/validation';
import {
  counted,
  formatCount,
  formatPercent,
  largestRemainder,
} from '../../design/format';
import {
  PARTY_GROUPS,
  byPartyGroup,
  partyGroup,
  partyGroupLabel,
  type PartyGroup,
} from '../../design/party-groups';
import {
  decodeIndustryMoney,
  decodeMatrix,
  decodeTide,
  partyName,
  topicNames,
} from '../reports/model';

const yearSource = shape({
  slug: nonempty,
  title: optional(text),
  speaker: nullable(text),
  party: nullable(text),
  state: nullable(text),
  date: nullable(date),
  cited: optional(boolean),
});
export const decodeYear = (raw: unknown, expectedYear?: number) => {
  const data = shape({
    year: count,
    generated_at: date,
    brief: shape({ answer: nonempty, sources: array(yearSource) }),
    voices: shape({
      unique_speeches: count,
      unlabelled_party: count,
      presiding_rows_skipped: optional(count),
      probes: array(shape({ q: nonempty, label: nonempty })),
      speakers: array(
        shape({ name: nonempty, party: nullable(text), speeches: count }),
      ),
      parties: array(shape({ party: nonempty, speeches: count })),
    }),
  })(raw);
  if (data.year < 1998 || data.year > 2026) invalid();
  if (expectedYear !== undefined && data.year !== expectedYear)
    invalid('The returned brief does not match this year.');
  return data;
};
export type Year = ReturnType<typeof decodeYear>;
/** The web's phone opening: whole sentences, with all remaining words behind a tap. */
export function yearOpening(answer: string) {
  const paragraphs = answer
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/\*\*/g, '')
        .replace(/^\s*(#+|[-*•])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  const first = paragraphs[0] ?? '';
  let end = -1;
  if (first.length > 460) {
    const sentence = /[.!?]["’”')\]]*(?=\s|$)/g;
    let match: RegExpExecArray | null;
    while ((match = sentence.exec(first.slice(0, 401))))
      if (match.index + match[0].length >= 160)
        end = match.index + match[0].length;
  }
  return end > 0 && end < first.length
    ? {
        lead: first.slice(0, end),
        rest: [first.slice(end).trim(), ...paragraphs.slice(1)],
      }
    : { lead: first, rest: paragraphs.slice(1) };
}
export function yearMachineNote(data: Year) {
  const sources = data.brief.sources,
    cited = sources.filter((s) => s.cited).length;
  return sources.length
    ? `Machine-written from ${sources.length} passages found for ${data.year}, ${cited} of them cited. A reading aid, not the record: check any claim against the speeches.`
    : `Machine-written from the passages found for ${data.year}. A reading aid, not the record.`;
}
export function voicesNote(data: Year) {
  const v = data.voices,
    total = v.unique_speeches,
    withParty = total - v.unlabelled_party;
  return [
    `Speeches per speaker among the ${formatCount(total)} strongest matches for ${data.year}’s ${v.probes.length || 4} debates.`,
    total && withParty < total
      ? `A party is recorded for ${formatCount(withParty)} of them.`
      : null,
    v.presiding_rows_skipped
      ? 'Rows the record gives to the presiding officers are left out.'
      : null,
    'This shows who is most heard in those debates, not who spoke most in parliament.',
  ]
    .filter(Boolean)
    .join(' ');
}
/** "the housing crisis": a leading "The" and a sentence-case capital drop; names keep theirs. */
function debateWords(label: string) {
  const text = label.trim();
  if (/^the\s/i.test(text)) return `the ${text.slice(4)}`;
  const [first = '', ...rest] = text.split(/\s+/);
  const named =
    rest.some((word) => /^[A-Z]/.test(word)) || /^[A-Z0-9-]{2,}$/.test(first);
  return named
    ? text
    : text.charAt(0).toLocaleLowerCase('en-AU') + text.slice(1);
}
function listWords(items: readonly string[]) {
  return items.length < 2
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}
/** What the voices are a sample of: "In debates on the housing crisis, cost of living …". */
export function voicesDebates(data: Pick<Year, 'voices'>): string | null {
  const labels = data.voices.probes.map((p) => debateWords(p.label));
  return labels.length ? `In debates on ${listWords(labels)}` : null;
}
/** A person id only for an exact, unique full-name match; never a guess. */
export function rosterMatch(
  name: string,
  roster: readonly { name: string }[],
  slugs: Readonly<Record<string, string>>,
): string | null {
  const wanted = name.trim();
  if (!wanted) return null;
  if (roster.filter((p) => p.name.trim() === wanted).length !== 1) return null;
  const ids = Object.entries(slugs).filter(([, n]) => n.trim() === wanted);
  return ids.length === 1 ? ids[0]![0] : null;
}
/** "Statements by Members", from "Scott Buchholz \u2014 Statements by Members \u2014 2025-02-10". */
export function cleanSpeechTitle(source: {
  title?: string | null;
  slug: string;
  speaker?: string | null;
  date?: string | null;
}) {
  const raw = source.title?.trim();
  if (!raw) return null;
  const parts = raw.split(/\s+\u2014\s+/).filter(Boolean);
  if (source.speaker && parts[0] === source.speaker.trim()) parts.shift();
  if (parts.length && /^\d{4}-\d{2}-\d{2}$/.test(parts.at(-1)!)) parts.pop();
  return parts.join(', ') || null;
}

/** Topic names drop the ampersand on screen: "Mining and energy". */
export function topicLabel(slug: string): string {
  return (topicNames[slug] ?? slug).replace(/\s*&\s*/g, ' and ');
}

export type Tide = ReturnType<typeof decodeTide> & {
  generated_at?: string;
};
export type TidePoint = Tide['topics'][string][number];
export type TideScope = 'federal' | 'all';
export type TideSort = 'rising' | 'falling' | 'now';
/**
 * The parliaments `/api/tide?scope=all` counts today (repo README): one
 * constant, so the picker's label and the note change together.
 */
export const TIDE_PARLIAMENTS = {
  count: 5,
  label: 'All five parliaments',
  names:
    'the federal, New South Wales, Victorian, South Australian and Queensland parliaments',
} as const;
export const tideScopeLabel = (scope: TideScope) =>
  scope === 'federal' ? 'Federal' : TIDE_PARLIAMENTS.label;
export function tideNote(scope: TideScope) {
  return `Each share is a subject’s part of all speeches with a topic label in that decade, in ${scope === 'federal' ? 'federal parliament' : TIDE_PARLIAMENTS.names}. Not every speech has a topic label yet; the counts below show how many do in each decade.`;
}
export const TIDE_NOTE = tideNote('federal');
/** A share as drawn: "12.4%". Shares arrive as fractions. */
export const shareText = (share: number) => formatPercent(share * 100);
/** A share's change in words: "up 8.0 points", "down 0.4 points", "no change". */
export function changeText(change: number) {
  const points = Math.round(Math.abs(change) * 1000) / 10;
  if (!points) return 'no change';
  return `${change > 0 ? 'up' : 'down'} ${points.toFixed(1)} points`;
}
/** The latest share, the change since the first decade, and whether any decade has a topic label. */
export function trend(points: readonly Pick<TidePoint, 'share' | 'count'>[]) {
  const now = points.at(-1)?.share ?? 0,
    first = points[0]?.share ?? 0;
  return {
    now,
    change: now - first,
    empty: !points.some((p) => p.count > 0),
  };
}
const decadeLabel = (decades: Tide['decades'], slug: string) =>
  decades.find((d) => d.slug === slug)?.label ?? slug;
/** Every decade, oldest first: "1993–99 4.4%, 2000s 7.4%, …". */
export function trendA11yValue(
  points: readonly Pick<TidePoint, 'decade' | 'share'>[],
  decades: Tide['decades'],
) {
  return points
    .map((p) => `${decadeLabel(decades, p.decade)} ${shareText(p.share)}`)
    .join(', ');
}
/** "Climate and environment. 12.4% of speeches with a topic label in 2020–26, up 8.0 points since 1993–99." */
export function trendA11yLabel(
  slug: string,
  points: readonly TidePoint[],
  decades: Tide['decades'],
) {
  const t = trend(points),
    last = points.at(-1),
    first = points[0];
  const since = first ? ` since ${decadeLabel(decades, first.decade)}` : '';
  return `${topicLabel(slug)}. ${shareText(t.now)} of speeches with a topic label${last ? ` in ${decadeLabel(decades, last.decade)}` : ''}, ${changeText(t.change)}${t.change && since ? since : ''}.`;
}
export interface TideRow {
  slug: string;
  points: TidePoint[];
  now: number;
  change: number;
}
/** Topics with any topic label, by the sort, ties by name; the rest are named once. */
export function tideRows(data: Pick<Tide, 'topics'>, sort: TideSort) {
  const slugs = [
    ...new Set([...Object.keys(topicNames), ...Object.keys(data.topics)]),
  ].filter((slug) => topicNames[slug]);
  const rows: TideRow[] = [],
    unlabelled: string[] = [];
  for (const slug of slugs) {
    const points = data.topics[slug] ?? [];
    const t = trend(points);
    if (t.empty) unlabelled.push(slug);
    else rows.push({ slug, points, now: t.now, change: t.change });
  }
  const byName = (a: string, b: string) =>
    topicLabel(a).localeCompare(topicLabel(b), 'en-AU');
  rows.sort(
    (a, b) =>
      (sort === 'now'
        ? b.now - a.now
        : sort === 'falling'
          ? a.change - b.change
          : b.change - a.change) || byName(a.slug, b.slug),
  );
  unlabelled.sort(byName);
  return { rows, unlabelled };
}
export const TIDE_SORTS: readonly { value: TideSort; label: string }[] = [
  { value: 'rising', label: 'Rising' },
  { value: 'falling', label: 'Falling' },
  { value: 'now', label: 'Largest now' },
];
/** The list header: the current sort in words, with the data's decade labels. */
export function tideSortHeader(sort: TideSort, decades: Tide['decades']) {
  const first = decades[0]?.label,
    last = decades.at(-1)?.label;
  if (sort === 'now')
    return last ? `Largest share in ${last}` : 'Largest share now';
  const verb = sort === 'rising' ? 'Rising most' : 'Falling most';
  return first ? `${verb} since ${first}` : verb;
}
/** "No topic label yet: Agriculture and Foreign affairs." */
export function noTopicLabelLine(slugs: readonly string[]) {
  return slugs.length
    ? `No topic label yet: ${listWords(slugs.map(topicLabel))}.`
    : null;
}
/** The decade coverage rows in the sources sheet. */
export function tideCoverage(decades: Tide['decades']) {
  return decades.map((d) => ({
    label: d.label,
    value: `${formatCount(d.labelled)} of ${formatCount(d.total)} have a topic label, ${Math.round(d.coverage * 100)}%`,
  }));
}
/** A table row's value: "4.4% · 849 speeches", or "None". */
export function tideCellText(point: Pick<TidePoint, 'share' | 'count'>) {
  return point.count > 0
    ? `${shareText(point.share)} · ${speechesText(point.count)}`
    : 'None';
}
export const speechesText = (n: number) => counted(n, 'speech', 'speeches');

export type Matrix = ReturnType<typeof decodeMatrix> & {
  generated_at?: string;
};
export type MatrixSort = 'speeches' | 'name';
export const MATRIX_SORTS: readonly { value: MatrixSort; label: string }[] = [
  { value: 'speeches', label: 'Most speeches' },
  { value: 'name', label: 'A to Z' },
];
/** Below this many speeches with a recorded party, a split is not drawn. */
export const THIN_PARTY_BASE = 200;
export const MATRIX_NOTE =
  'Not every speech has a topic label yet, so every number here is a floor and shares may shift. Shares are of the speeches on each subject whose speaker’s party is recorded.';
export const MATRIX_GROUPS_NOTE =
  'Labor is the Australian Labor Party. The Coalition is the Country Liberal, Liberal, Liberal National and National parties. The crossbench is every other party and independent. Each group is drawn in the same tone; open a subject’s split to see every party.';
/** Speeches with a recorded party: the share base. */
export const partyBase = (cells: Readonly<Record<string, number>>) =>
  Object.values(cells).reduce((sum, n) => sum + Math.max(0, n), 0);
/** A whole percentage as drawn: "<1%" for a non-zero share that rounds to 0. */
const percentText = (percent: number, count: number) =>
  `${percent === 0 && count > 0 ? '<1' : percent}%`;
export type GroupShares =
  | { thin: number }
  | {
      base: number;
      groups: {
        group: PartyGroup;
        label: string;
        count: number;
        percent: number;
        text: string;
      }[];
    };
/**
 * Labor, the Coalition and the crossbench, in that order, as whole
 * percentages of speeches with a recorded party that add to 100. Fewer than
 * 200 such speeches: `{ thin }` with the count instead of a split.
 */
export function groupShares(
  cells: Readonly<Record<string, number>>,
  base = partyBase(cells),
): GroupShares {
  if (base < THIN_PARTY_BASE) return { thin: base };
  const counts = PARTY_GROUPS.map((group) =>
    Object.entries(cells)
      .filter(([party]) => partyGroup(party) === group)
      .reduce((sum, [, n]) => sum + Math.max(0, n), 0),
  );
  const percents = largestRemainder(counts);
  return {
    base,
    groups: PARTY_GROUPS.map((group, i) => ({
      group,
      label: partyGroupLabel(group),
      count: counts[i]!,
      percent: percents[i]!,
      text: `${partyGroupLabel(group)} ${percentText(percents[i]!, counts[i]!)}`,
    })),
  };
}
/** "Labor 41% · the Coalition 37% · the crossbench 22%". */
export const groupSharesText = (
  shares: Extract<GroupShares, { groups: unknown }>,
) => shares.groups.map((g) => g.text).join(' · ');
/**
 * Every party with speeches on the subject, in party-groups order, with its
 * share of speeches with a recorded party and its count. On a thin subject
 * (`thin`), counts only.
 */
export function partyShares(
  cells: Readonly<Record<string, number>>,
  base = partyBase(cells),
) {
  const thin = base < THIN_PARTY_BASE;
  const rows = byPartyGroup(
    Object.entries(cells).filter(([, n]) => n > 0),
    ([party]) => partyName(party),
  );
  const percents = largestRemainder(rows.map(([, n]) => n));
  return rows.map(([party, count], i) => ({
    party,
    name: partyName(party),
    count,
    percent: thin ? null : percents[i]!,
    text: thin
      ? speechesText(count)
      : `${percentText(percents[i]!, count)} · ${speechesText(count)}`,
  }));
}
/** Topics with any topic label, by count (ties by name) or A to Z. */
export function matrixRows(data: Pick<Matrix, 'totals'>, sort: MatrixSort) {
  const slugs = Object.keys(topicNames);
  const byName = (a: string, b: string) =>
    topicLabel(a).localeCompare(topicLabel(b), 'en-AU');
  return {
    rows: slugs
      .filter((slug) => (data.totals[slug] ?? 0) > 0)
      .sort((a, b) =>
        sort === 'name'
          ? byName(a, b)
          : (data.totals[b] ?? 0) - (data.totals[a] ?? 0) || byName(a, b),
      ),
    unlabelled: slugs
      .filter((slug) => !((data.totals[slug] ?? 0) > 0))
      .sort(byName),
  };
}

export const pairings = [
  { topic: 'gambling', industries: ['gambling'], money: 'Gambling' },
  { topic: 'financial-services', industries: ['finance'], money: 'Finance' },
  {
    topic: 'mining-energy',
    industries: ['mining', 'fossil_fuels'],
    money: 'Mining and fossil-fuel',
  },
  {
    topic: 'property-construction',
    industries: ['property'],
    money: 'Property and construction',
  },
  { topic: 'media-communications', industries: ['media'], money: 'Media' },
  {
    topic: 'hospitality-alcohol',
    industries: ['hospitality', 'alcohol'],
    money: 'Hospitality and alcohol',
  },
  { topic: 'agriculture', industries: ['agriculture'], money: 'Agriculture' },
  { topic: 'unions-workplace', industries: ['unions'], money: 'Union' },
]
  .map((p) => ({ ...p, industryNoun: `${p.money.toLowerCase()} donors` }))
  // A to Z, so the tool never leads with a chosen subject.
  .sort((a, b) =>
    topicLabel(a.topic).localeCompare(topicLabel(b.topic), 'en-AU'),
  );
export type Pairing = (typeof pairings)[number];
/** Two AEC industry groups in one pairing: said once, in the sheet. */
export const combinedIndustryNote = (pairing: Pairing) =>
  pairing.industries.length > 1
    ? `Donations combine two AEC industry groups: ${listWords(pairing.industries.map((i) => i.replaceAll('_', ' ')))}.`
    : null;
/**
 * One subject's donations beside its speeches, every party in party-groups
 * order (Labor; the Coalition; the crossbench A to Z, Independent), never
 * by amount. Shares are of the subject's speeches with a recorded party.
 */
export function wordsPanel(
  pairing: Pick<Pairing, 'topic' | 'industries'>,
  matrix: Pick<Matrix, 'cells' | 'totals' | 'parties'> | null,
  money: ReturnType<typeof decodeIndustryMoney>,
) {
  const donors = money.nodes.filter(
    (n) => n.kind === 'donor' && pairing.industries.includes(n.industry ?? ''),
  );
  const ids = new Set(donors.map((n) => n.id)),
    amounts = new Map<string, number>();
  for (const e of money.edges)
    if (ids.has(e.source)) {
      const party = e.target.replace(/^party:/, '');
      amounts.set(party, (amounts.get(party) ?? 0) + e.total);
    }
  const cells = matrix?.cells[pairing.topic] ?? {},
    base = partyBase(cells);
  const parties = [
    ...new Set([
      ...amounts.keys(),
      ...Object.keys(cells).filter((p) => p !== 'Other'),
    ]),
  ];
  return {
    total: matrix?.totals[pairing.topic] ?? 0,
    base,
    moneyTotal: [...amounts.values()].reduce((a, b) => a + b, 0),
    rows: byPartyGroup(parties, partyName).map((party) => {
      const speeches = cells[party] ?? 0;
      return {
        party,
        name: partyName(party),
        money: amounts.get(party) ?? 0,
        speeches,
        share: base ? (speeches / base) * 100 : 0,
        speechKnown: !!matrix?.parties.includes(party),
      };
    }),
  };
}
export const WORDS_NOTE =
  'Shown together for comparison. OPAX does not claim one causes the other. Donations under the disclosure threshold are not reported, so totals are a floor, not a ceiling. AEC data groups party recipients; money to independents is not separated. Not every speech has a topic label yet, so speech counts are floors and shares may shift.';
export type Result<T> = RecordResult<T>;
export const identityObject = (raw: unknown) => object(raw);
