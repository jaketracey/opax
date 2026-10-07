import { recordTypes, topics } from './web-options';
export { recordTypes, topics, parties, examples } from './web-options';
export const modes = [
  { value: 'hybrid', label: 'Meaning and words' },
  { value: 'semantic', label: 'Match meaning' },
  { value: 'keyword', label: 'Match words' },
] as const;
export const sorts = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title_asc', label: 'Title A–Z' },
  { value: 'title_desc', label: 'Title Z–A' },
  { value: 'type', label: 'Record type' },
] as const;
export const jurisdictions = [
  { value: 'federal', label: 'Federal' },
  { value: 'nsw', label: 'NSW' },
  { value: 'vic', label: 'VIC' },
  { value: 'sa', label: 'SA' },
  { value: 'qld', label: 'QLD' },
  { value: 'tas', label: 'TAS' },
  { value: 'wa', label: 'WA' },
  { value: 'nt', label: 'NT' },
  { value: 'act', label: 'ACT' },
] as const;
export const moreCatalogKinds = [
  'party',
  'agency',
  'grant',
  'report',
  'bill',
] as const;
export type MoreCatalogKind = (typeof moreCatalogKinds)[number];
export const excludedKinds: Readonly<Record<string, string>> = {
  donor: 'Donor rows have no organisation discriminator.',
  receipt: 'Receipt rows have no organisation discriminator for the donor.',
  supplier:
    'An ABN does not distinguish a company from an individual or sole trader.',
  contract:
    'Contract rows carry a supplier name but no organisation discriminator.',
  access:
    'Lobbying and diary rows mix private individuals and organisations without a discriminator.',
  campaigner: 'Campaigner rows have no organisation discriminator.',
};
export const documentKinds = [
  'all',
  'speech',
  'division',
  'press_release',
  'grant_invitation',
  'grant_award',
  'election_baseline',
  'parliamentary_profile',
  'research_report',
] as const;
export const isMoreKind = (kind: string): kind is MoreCatalogKind =>
  moreCatalogKinds.includes(kind as MoreCatalogKind);
export const isDocumentKind = (kind: string) =>
  documentKinds.includes(kind as (typeof documentKinds)[number]);
export type SearchFilters = {
  kind: string;
  mode: 'hybrid' | 'semantic' | 'keyword';
  speaker: string;
  party: string;
  state: string;
  topic: string;
  from: string;
  to: string;
};
export type SearchSort = (typeof sorts)[number]['value'];
export const defaultFilters: SearchFilters = {
  kind: 'all',
  mode: 'hybrid',
  speaker: '',
  party: '',
  state: '',
  topic: '',
  from: '',
  to: '',
};
export const typeLabel = (kind: string) =>
  recordTypes.find((t) => t.value === kind)?.label ?? kind;
export function normaliseFilters(f: SearchFilters): SearchFilters {
  let from = f.from,
    to = f.to;
  if (from && to && Number(from) > Number(to)) [from, to] = [to, from];
  if (from === '1993' && to === '2026') {
    from = '';
    to = '';
  }
  return { ...f, from, to, mode: isDocumentKind(f.kind) ? f.mode : 'keyword' };
}
/** searchQueryParams in app.js, unchanged, including the 20-row page. */
export function searchParams(
  q: string,
  f: SearchFilters,
  page = 1,
  sort: SearchSort = 'relevance',
) {
  const p = new URLSearchParams({
    q: q.trim() || f.speaker,
    kind: f.kind || 'all',
    mode: f.mode || 'hybrid',
    page: String(page),
    per: '20',
    sort,
  });
  for (const key of [
    'speaker',
    'party',
    'state',
    'topic',
    'from',
    'to',
  ] as const)
    if (f[key]) p.set(key, f[key]);
  return p;
}
export function searchWebPath(
  q: string,
  f: SearchFilters,
  page = 1,
  sort: SearchSort = 'relevance',
) {
  const p = new URLSearchParams({ view: 'search' });
  if (q.trim()) p.set('q', q.trim());
  for (const key of [
    'speaker',
    'party',
    'state',
    'topic',
    'from',
    'to',
  ] as const)
    if (f[key]) p.set(key, f[key]);
  if (f.kind !== 'all') p.set('kind', f.kind);
  if (f.mode !== 'hybrid') p.set('mode', f.mode);
  if (sort !== 'relevance') p.set('sort', sort);
  if (page > 1) p.set('page', String(page));
  return '/ask?' + p;
}
export function filterChips(f: SearchFilters) {
  const chips: {
    id: keyof SearchFilters | 'years';
    filter: string;
    value: string;
  }[] = [];
  if (f.speaker)
    chips.push({ id: 'speaker', filter: 'speaker', value: f.speaker });
  if (f.party) chips.push({ id: 'party', filter: 'party', value: f.party });
  if (f.state)
    chips.push({
      id: 'state',
      filter: 'parliament',
      value: jurisdictions.find((j) => j.value === f.state)?.label ?? f.state,
    });
  if (f.topic)
    chips.push({
      id: 'topic',
      filter: 'topic',
      value: topics[f.topic as keyof typeof topics] ?? f.topic,
    });
  if (f.from || f.to)
    chips.push({
      id: 'years',
      filter: 'years',
      value: `${f.from || '1993'} to ${f.to || '2026'}`,
    });
  if (f.kind !== 'all')
    chips.push({ id: 'kind', filter: 'record type', value: typeLabel(f.kind) });
  if (f.mode !== 'hybrid')
    chips.push({
      id: 'mode',
      filter: 'mode',
      value: modes.find((m) => m.value === f.mode)!.label,
    });
  return chips;
}
