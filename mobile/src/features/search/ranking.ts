import type { BillIndex, ElectorateIndex } from '../../api/catalog-decoders';
import type { SuggestionRoster } from '../../api/selectors';
import { nameKey } from '../../api/ids';
import { topicDescriptions, topicNames } from '../reports/model';

/**
 * The match-tier rule (journeys/search.md 3.3): one deterministic order for
 * suggestions, Top hits and All's groups. Never popularity, never recency of
 * coverage. Its words are in the results source sheet ("How this is chosen").
 *
 * 0 exact: the query equals a name, ignoring case and accents.
 * 1 prefix: a name starts with the query.
 * 2 word: a whole word inside a name starts with the query.
 */
export type Tier = 0 | 1 | 2;
export const ORDER_RULE =
  'Names that match exactly come first, then names that start with your words, then names that contain them. Within each, sitting members and current bills and parties come first, then A to Z. Nothing is ranked by popularity.';

/** Case, accents and punctuation folded away; words separated by one space. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-AU')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The best tier of `names` for `query`, or null when none matches. */
export function matchTier(
  names: readonly (string | null | undefined)[],
  query: string,
  wordsOnly: readonly (string | null | undefined)[] = [],
): Tier | null {
  const q = fold(query);
  if (!q) return null;
  let best: Tier | null = null;
  for (const raw of names) {
    if (!raw) continue;
    const name = fold(raw);
    if (!name) continue;
    if (name === q) return 0;
    if (name.startsWith(q)) best = 1;
    else if (best === null && ` ${name}`.includes(` ${q}`)) best = 2;
  }
  if (best === null)
    for (const raw of wordsOnly)
      if (raw && ` ${fold(raw)}`.includes(` ${q}`)) return 2;
  return best;
}

/** Display names use "and" for "&" (specs/search.md 4.2). */
export const topicLabel = (name: string) => name.replace(/\s*&\s*/g, ' and ');

export interface TopicMatch {
  slug: string;
  title: string;
  description: string;
  aliases?: readonly string[];
}
/** Everyday words for a topic that its name and description don't use. */
const topicAliases: Readonly<Record<string, readonly string[]>> = {
  gambling: ['pokies', 'betting', 'gaming'],
  'climate-environment': ['emissions', 'renewable energy', 'net zero'],
  'mining-energy': ['coal', 'gas', 'electricity'],
  housing: ['rent', 'renters', 'home ownership'],
  health: ['Medicare', 'hospitals', 'aged care'],
  'indigenous-affairs': ['First Nations', 'Aboriginal', 'Torres Strait'],
  'tax-budget': ['budget', 'GST', 'tax'],
  'welfare-social': ['NDIS', 'pensions', 'Centrelink'],
  'unions-workplace': ['wages', 'industrial relations'],
  'integrity-democracy': ['corruption', 'lobbying', 'elections'],
  'defence-security': ['veterans', 'AUKUS'],
  'foreign-affairs': ['trade', 'aid'],
};
export const allTopics: readonly TopicMatch[] = Object.entries(topicNames).map(
  ([slug, name]) => ({
    slug,
    title: topicLabel(name),
    description: topicDescriptions[slug] ?? '',
    aliases: topicAliases[slug] ?? [],
  }),
);
const topicTier = (t: TopicMatch, q: string) =>
  matchTier([t.title, t.slug.replace(/-/g, ' '), ...(t.aliases ?? [])], q, [
    t.description,
  ]);

/** Topics whose name, or a whole word of their description, match `q`. */
export function matchTopics(q: string, topics = allTopics): TopicMatch[] {
  return rank(
    topics,
    (t) => topicTier(t, q),
    () => true,
    (t) => t.title,
  ).map((r) => r.item);
}

export type GroupKind =
  | 'topics'
  | 'people'
  | 'electorates'
  | 'bills'
  | 'parties';
/** Ties between groups fall back to this fixed order. */
export const groupOrder: readonly GroupKind[] = [
  'topics',
  'people',
  'electorates',
  'bills',
  'parties',
];
export const groupLabels: Record<GroupKind, string> = {
  topics: 'Topics',
  people: 'People',
  electorates: 'Electorates',
  bills: 'Bills',
  parties: 'Parties',
};

type Person = SuggestionRoster['people'][number];
type Seat = ElectorateIndex['electorates'][number];
type BillRow = BillIndex['bills'][number];
export interface PartyMatch {
  name: string;
}
export type Match =
  | { kind: 'topics'; key: string; tier: Tier; item: TopicMatch }
  | { kind: 'people'; key: string; tier: Tier; item: Person }
  | { kind: 'electorates'; key: string; tier: Tier; item: Seat }
  | { kind: 'bills'; key: string; tier: Tier; item: BillRow }
  | { kind: 'parties'; key: string; tier: Tier; item: PartyMatch };
export interface MatchGroup {
  kind: GroupKind;
  label: string;
  tier: Tier;
  rows: Match[];
}

function rank<T>(
  items: readonly T[],
  tier: (item: T) => Tier | null,
  current: (item: T) => boolean,
  sortName: (item: T) => string,
): { item: T; tier: Tier }[] {
  const out: { item: T; tier: Tier; current: boolean; name: string }[] = [];
  for (const item of items) {
    const t = tier(item);
    if (t !== null)
      out.push({
        item,
        tier: t,
        current: current(item),
        name: fold(sortName(item)),
      });
  }
  return out
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.current) - Number(a.current) ||
        a.name.localeCompare(b.name, 'en-AU'),
    )
    .map(({ item, tier: t }) => ({ item, tier: t }));
}

const surname = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
const given = (name: string) => name.trim().split(/\s+/).slice(0, -1).join(' ');
/** "Liberal Party of Australia" is also "Liberal"; "Australian Labor Party" is "Labor". */
export function partyNames(name: string): string[] {
  const short = name
    .replace(/^Australian\s+/i, '')
    .replace(/\s+Party(\s+of\s+Australia)?$/i, '')
    .replace(/\s+of\s+Australia$/i, '')
    .trim();
  return short && short !== name ? [name, short] : [name];
}
const billCurrent = (b: BillRow) =>
  b.status === 'before_parliament' || b.status === 'exposure_draft';

/** One roster row per person: roster ID first, then the folded name. */
export function dedupePeople(people: readonly Person[]): Person[] {
  const byKey = new Map<string, Person>();
  for (const person of people) {
    const key = person.pid
      ? `pid:${person.pid}`
      : `name:${nameKey(person.name)}`;
    const named = `name:${nameKey(person.name)}`;
    const previous = byKey.get(key) ?? byKey.get(named);
    if (!previous || (person.speeches ?? 0) > (previous.speeches ?? 0)) {
      byKey.set(key, person);
      byKey.set(named, person);
    }
  }
  return [...new Set(byKey.values())];
}

export interface MatchSources {
  roster?: SuggestionRoster | null;
  electorates?: ElectorateIndex | null;
  bills?: BillIndex | null;
  topics?: readonly TopicMatch[];
}
// One render asks for the same matches several times (Top hits, groups,
// the count); keep the last answer per sources object.
const lastMatch = new WeakMap<
  MatchSources,
  { q: string; result: Record<GroupKind, Match[]> }
>();

/** Every on-device match for `q`, per group, each group in tier order. */
export function matchAll(
  q: string,
  sources: MatchSources,
): Record<GroupKind, Match[]> {
  const last = lastMatch.get(sources);
  if (last && last.q === q) return last.result;
  const result = computeMatches(q, sources);
  lastMatch.set(sources, { q, result });
  return result;
}
function computeMatches(
  q: string,
  sources: MatchSources,
): Record<GroupKind, Match[]> {
  // One letter matches nearly every name: nothing on the device until two.
  if (fold(q).length < 2)
    return { topics: [], people: [], electorates: [], bills: [], parties: [] };
  const people = dedupePeople(sources.roster?.people ?? []);
  const parties = [
    ...new Set(
      (sources.roster?.people ?? []).flatMap((p) =>
        [p.party_now, p.party].filter((v): v is string => !!v?.trim()),
      ),
    ),
  ]
    .filter((name) => !/^(ind|independent|pres|spk)$/i.test(name))
    .map((name) => ({ name }));
  return {
    topics: matchTopics(q, sources.topics ?? allTopics).map((item) => ({
      kind: 'topics' as const,
      key: item.slug,
      tier: topicTier(item, q)!,
      item,
    })),
    people: rank(
      people,
      (p) => matchTier([p.name, surname(p.name), ...(p.aliases ?? [])], q),
      (p) => !!p.current,
      (p) => `${surname(p.name)} ${given(p.name)}`,
    ).map(({ item, tier }) => ({
      kind: 'people' as const,
      key: item.pid ?? nameKey(item.name),
      tier,
      item,
    })),
    electorates: rank(
      sources.electorates?.electorates ?? [],
      (s) => matchTier([s.name, ...(s.aliases ?? [])], q),
      (s) => s.status !== 'historical',
      (s) => s.name,
    ).map(({ item, tier }) => ({
      kind: 'electorates' as const,
      key: item.electorate_id,
      tier,
      item,
    })),
    bills: rank(
      sources.bills?.bills ?? [],
      (b) => matchTier([b.short_title, b.title, ...(b.aliases ?? [])], q),
      billCurrent,
      (b) => b.short_title || b.title,
    ).map(({ item, tier }) => ({
      kind: 'bills' as const,
      key: item.key,
      tier,
      item,
    })),
    parties: rank(
      parties,
      (p) => matchTier(partyNames(p.name), q),
      () => true,
      (p) => p.name,
    ).map(({ item, tier }) => ({
      kind: 'parties' as const,
      key: item.name,
      tier,
      item,
    })),
  };
}

/** Groups ordered by the tier of their best row; ties in the fixed order. */
export function orderGroups(matches: Record<GroupKind, Match[]>): MatchGroup[] {
  return groupOrder
    .filter((kind) => matches[kind].length)
    .map((kind) => ({
      kind,
      label: groupLabels[kind],
      tier: matches[kind][0]!.tier,
      rows: matches[kind],
    }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        groupOrder.indexOf(a.kind) - groupOrder.indexOf(b.kind),
    );
}

/**
 * Typing's one list (journeys/search.md 3.3): a Top suggestion only when a
 * name matches exactly or by prefix; it is not repeated in its group.
 */
export function suggestionList(
  q: string,
  sources: MatchSources,
  perGroup = 3,
  maxGroups = 4,
) {
  const groups = fold(q).length >= 2 ? orderGroups(matchAll(q, sources)) : [];
  const first = groups[0]?.rows[0];
  const top = first && first.tier <= 1 ? first : null;
  return {
    top,
    groups: groups
      .map((g) => ({
        ...g,
        total: g.rows.length - (top && g.kind === top.kind ? 1 : 0),
        rows: g.rows.filter((row) => row !== top).slice(0, perGroup),
      }))
      .filter((g) => g.rows.length)
      .slice(0, maxGroups),
  };
}

/** All's Top hits: the first row of each of up to three groups, in group order. */
export function topHits(groups: readonly MatchGroup[], max = 3): Match[] {
  return groups.slice(0, max).map((g) => g.rows[0]!);
}
