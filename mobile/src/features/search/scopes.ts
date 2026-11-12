import { documentKinds, excludedKinds, type SearchSort } from './contracts';

/**
 * Four scopes, drawn in content (journeys/search.md 3.4, D-7). Money is not
 * a scope: it is a group in All and a pushed list.
 */
export const scopes = [
  { value: 'all', label: 'All' },
  { value: 'people', label: 'People' },
  { value: 'bills', label: 'Bills' },
  { value: 'speeches', label: 'Speeches' },
] as const;
export type Scope = (typeof scopes)[number]['value'];
export const isScope = (value: unknown): value is Scope =>
  scopes.some((s) => s.value === value);
export const scopeLabel = (scope: Scope) =>
  scopes.find((s) => s.value === scope)!.label;

/**
 * Lists, not scopes: each is one `/results/[kind]?group=` page. Catalogue
 * groups name the one `/api/search-all` kind their single read uses.
 */
export const groups = {
  reports: {
    label: 'Reports',
    noun: 'reports',
    one: 'report',
    catalog: 'report',
  },
  topics: { label: 'Topics', noun: 'topics', one: 'topic' },
  electorates: {
    label: 'Electorates',
    noun: 'electorates',
    one: 'electorate',
  },
  parties: { label: 'Parties', noun: 'parties', one: 'party' },
  interests: {
    label: 'Declared interests',
    noun: 'declared interests',
    one: 'declared interest',
    catalog: 'interest',
  },
  pay: { label: 'Pay', noun: 'pay records', one: 'pay record', catalog: 'pay' },
  expenses: {
    label: 'Expenses',
    noun: 'expense records',
    one: 'expense record',
    catalog: 'expense',
  },
  grants: { label: 'Grants', noun: 'grants', one: 'grant', catalog: 'grant' },
  agencies: {
    label: 'Government agencies',
    noun: 'government agencies',
    one: 'government agency',
    catalog: 'agency',
  },
} as const;
export type Group = keyof typeof groups;
export type CatalogGroup = {
  [K in Group]: (typeof groups)[K] extends { catalog: string } ? K : never;
}[Group];
export const isGroup = (value: unknown): value is Group =>
  typeof value === 'string' && Object.hasOwn(groups, value);
export const isCatalogGroup = (value: unknown): value is CatalogGroup =>
  isGroup(value) && 'catalog' in groups[value];
/** The registers People and All offer as tap-to-run rows. */
export const registerGroups: readonly CatalogGroup[] = [
  'interests',
  'pay',
  'expenses',
];
/** Money in All: grants and government agencies, one read each on tap. */
export const moneyGroups: readonly CatalogGroup[] = ['grants', 'agencies'];

/**
 * Singular names other lanes and older links use for `/results/[kind]`
 * ("speech", "person", "interest"), folded onto a scope or a group.
 */
const aliases: Readonly<Record<string, Scope | Group>> = {
  report: 'reports',
  speech: 'speeches',
  record: 'speeches',
  records: 'speeches',
  person: 'people',
  bill: 'bills',
  topic: 'topics',
  electorate: 'electorates',
  party: 'parties',
  interest: 'interests',
  expense: 'expenses',
  grant: 'grants',
  agency: 'agencies',
  money: 'grants',
};
export type ResultsTarget =
  | { scope: Scope; group?: undefined }
  | { group: Group; scope?: undefined };
/** What a `/results/[kind]` route draws; `group=` wins over `kind`. */
export function resultsTarget(
  kind: string | undefined,
  group?: string,
  scope?: string,
): ResultsTarget | null {
  for (const value of [group, kind, scope]) {
    if (!value) continue;
    const name = aliases[value] ?? value;
    if (isGroup(name)) return { group: name };
    if (isScope(name)) return { scope: name };
  }
  return null;
}

/**
 * A web search `kind` as a scope or group (journeys/search.md 4.5): `all`
 * to All; people registers to People; `bill` to Bills; document kinds (and
 * no kind with a speaker) to Speeches; money kinds to their list; an
 * excluded kind to All with the same query.
 */
export function targetForWebKind(
  kind: string | null,
  speaker?: string | null,
): ResultsTarget {
  if (!kind) return { scope: speaker ? 'speeches' : 'all' };
  if (kind === 'all') return { scope: 'all' };
  if (['person', 'interest', 'pay', 'expense'].includes(kind))
    return { scope: 'people' };
  if (kind === 'bill') return { scope: 'bills' };
  if (kind === 'report') return { group: 'reports' };
  if (kind === 'grant') return { group: 'grants' };
  if (kind === 'agency') return { group: 'agencies' };
  if (kind === 'party') return { group: 'parties' };
  if (Object.hasOwn(excludedKinds, kind)) return { scope: 'all' };
  if ((documentKinds as readonly string[]).includes(kind))
    return { scope: 'speeches' };
  return { scope: 'all' };
}

/** Link queries are untrusted: at most 100 characters, cut at a whole word. */
export function capQuery(q: unknown, max = 100): string {
  // A repeated `q=` arrives from expo-router as an array: not a query.
  if (typeof q !== 'string') return '';
  const text = q.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : text.slice(0, max)).trim();
}

/**
 * The opax.com.au search address for a query, scope and filters, as the
 * web reads it (`/ask?view=search&q=…&kind=…`): the Share button's link.
 */
export function webSearchPath(
  q: string,
  target: ResultsTarget,
  filters: Record<string, string> = {},
  sort: SearchSort = 'relevance',
): string {
  const kind = target.group
    ? (
        {
          grants: 'grant',
          reports: 'report',
          agencies: 'agency',
          parties: 'party',
          interests: 'interest',
          pay: 'pay',
          expenses: 'expense',
        } as Partial<Record<Group, string>>
      )[target.group]
    : (
        {
          all: 'all',
          people: 'person',
          bills: 'bill',
          speeches: filters.type || 'speech',
        } as const
      )[target.scope];
  const params = new URLSearchParams({ view: 'search', q: capQuery(q) });
  if (kind) params.set('kind', kind);
  if (target.scope === 'speeches' || target.scope === 'all')
    for (const [key, value] of Object.entries(filters))
      if (value && key !== 'type') params.set(key, value);
  if (target.scope === 'speeches' && sort !== 'relevance')
    params.set('sort', sort);
  return `/ask?${params}`;
}
