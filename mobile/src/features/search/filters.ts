import {
  registerFilterModel,
  filterStore,
  type FilterChoice,
  type FilterValues,
} from '../sheets/filter-model';
import { searchFilterModel } from '../sheets/filter-models';
import type { Roster } from '../../api/catalog-decoders';
import { normaliseFilters, type SearchFilters } from './contracts';
import { allTopics } from './ranking';

/**
 * The speech filters of one search session (journeys/search.md 3.5): the
 * shared Ask and Search `FilterModel` (D-8) at `/filters/search`, with
 * "Person" naming the speaker row (journeys/ask.md 14; the request key
 * stays `speaker`). Search defaults to speeches only; Type "All records"
 * widens the Speeches scope.
 */
export type SpeechFilters = {
  kind: string;
  mode: string;
  speaker: string;
  party: string;
  state: string;
  topic: string;
  from: string;
  to: string;
};
export const defaultSpeechFilters: SpeechFilters = {
  kind: 'speech',
  mode: 'hybrid',
  speaker: '',
  party: '',
  state: '',
  topic: '',
  from: '',
  to: '',
};
const keys = Object.keys(defaultSpeechFilters) as (keyof SpeechFilters)[];
export const filterParamKeys = [
  'speaker',
  'party',
  'state',
  'topic',
  'from',
  'to',
] as const;

export function speechFilters(
  values: Partial<Record<string, unknown>> = {},
): SpeechFilters {
  const out = { ...defaultSpeechFilters };
  for (const key of keys) {
    const value = values[key];
    if (typeof value === 'string' || typeof value === 'number')
      out[key] = String(value);
  }
  if (!['speech', 'press_release', 'all'].includes(out.kind))
    out.kind = 'speech';
  if (!['hybrid', 'semantic', 'keyword'].includes(out.mode))
    out.mode = 'hybrid';
  return out;
}
/** Route params (`type=all` widens to every record) as filters. */
export function filtersFromParams(
  params: Partial<Record<string, string | string[] | undefined>>,
): SpeechFilters {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value : '';
  };
  return speechFilters({
    ...Object.fromEntries(filterParamKeys.map((key) => [key, one(key)])),
    kind: one('type') || 'speech',
    mode: one('mode') || 'hybrid',
  });
}
export function filtersToParams(f: SpeechFilters): Record<string, string> {
  return {
    ...Object.fromEntries(
      filterParamKeys.filter((key) => f[key]).map((key) => [key, f[key]]),
    ),
    ...(f.kind !== 'speech' ? { type: f.kind } : {}),
    ...(f.mode !== 'hybrid' ? { mode: f.mode } : {}),
  };
}
/** The request filters RecordSearch sends (unchanged request keys). */
export function requestFilters(f: SpeechFilters): SearchFilters {
  return normaliseFilters({
    kind: ['all', 'press_release'].includes(f.kind) ? f.kind : 'speech',
    mode: (['hybrid', 'semantic', 'keyword'].includes(f.mode)
      ? f.mode
      : 'hybrid') as SearchFilters['mode'],
    speaker: f.speaker,
    party: f.party,
    state: f.state,
    topic: f.topic,
    from: f.from,
    to: f.to,
  });
}
/** Part of every speech read's cache key: any filter change is a new read. */
export function filtersKey(f: SpeechFilters): string {
  return keys.map((key) => `${key}=${f[key]}`).join('&');
}
export function hasFilters(f: SpeechFilters): boolean {
  return keys.some((key) => f[key] !== defaultSpeechFilters[key]);
}

const parliaments: Readonly<Record<string, string>> = {
  federal: 'Federal Parliament',
  nsw: 'New South Wales Parliament',
  vic: 'Victorian Parliament',
  qld: 'Queensland Parliament',
  sa: 'South Australian Parliament',
  act: 'ACT Legislative Assembly',
};
/** The filter line, in the sheet's order: "Labor · 2024 to 2026". */
export function filtersLine(f: SpeechFilters): string {
  const years =
    f.from || f.to
      ? f.from && f.to
        ? f.from === f.to
          ? f.from
          : `${f.from} to ${f.to}`
        : f.from
          ? `From ${f.from}`
          : `To ${f.to}`
      : '';
  return [
    f.speaker,
    f.party,
    f.state ? (parliaments[f.state] ?? f.state) : '',
    f.topic
      ? (allTopics.find((t) => t.slug === f.topic)?.title ?? f.topic)
      : '',
    years,
    f.kind === 'all'
      ? 'All records'
      : f.kind === 'press_release'
        ? 'Media releases and transcripts'
        : '',
    f.mode === 'keyword'
      ? 'Exact words only'
      : f.mode === 'semantic'
        ? 'Match meaning'
        : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
export const clearedFilters = (): SpeechFilters => ({
  ...defaultSpeechFilters,
});

/** Parliamentarians for the Person row, sitting first, then by surname. */
export function personChoices(roster: Roster | null | undefined) {
  if (!roster) return undefined;
  const seen = new Set<string>();
  return roster.people
    .filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    })
    .map((p) => ({ value: p.name, label: p.name }));
}

/**
 * The search filter sheet's model for one owner (the Search root, or one
 * pushed results list), with "Person" for the speaker row.
 */
export function registerSearchFilters(
  owner: string,
  value: SpeechFilters,
  onChange: (next: SpeechFilters) => void,
  members?: FilterChoice[],
) {
  const base = searchFilterModel({
    members,
    topics: allTopics.map((t) => ({ value: t.slug, label: t.title })),
    defaultKind: 'speech',
  });
  const model = {
    ...base,
    rows: base.rows.map((row) =>
      row.key === 'speaker'
        ? { ...row, title: 'Person', searchPlaceholder: 'Name or electorate' }
        : row,
    ),
  };
  return registerFilterModel(model, {
    owner,
    value: value as unknown as FilterValues,
    onChange: (next) => onChange(speechFilters(next)),
  });
}
export const searchFilterStore = (owner: string) =>
  filterStore<FilterValues>('search', owner);
