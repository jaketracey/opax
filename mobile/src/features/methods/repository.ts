import { decodeCorpus, type Corpus } from '../../api/catalog-decoders';
import type { ApiClient, RecordResult } from '../../api/client';
import { apiClient } from '../../api/runtime';
import { count, dict, nullable, shape } from '../../api/validation';
import { coverageCopy, kindNames, parliamentNames } from './copy';

/** `/api/stats`: what OPAX holds now, by kind and by parliament. */
export const decodeCounts = shape({
  resources: count,
  paragraphs: count,
  kinds: nullable(dict(count)),
  speeches_by_state: nullable(dict(count)),
});
export type Counts = ReturnType<typeof decodeCounts>;

/**
 * The record summary (`/corpus.json`, a free catalogue read) and the live
 * counts (`/api/stats`, a paid read). Constructing this sends nothing. The
 * counts are read once a session, when Coverage opens: the client keeps the
 * session's answer, so later visits and a pull to refresh draw it again.
 */
export class ReferenceRepository {
  constructor(private client: Pick<ApiClient, 'get' | 'getForAction'>) {}
  summary = (
    refresh = false,
    signal?: AbortSignal,
  ): Promise<RecordResult<Corpus>> =>
    this.client.get('/corpus.json', decodeCorpus, refresh, { signal });
  counts = (
    refresh = false,
    signal?: AbortSignal,
  ): Promise<RecordResult<Counts>> =>
    this.client.getForAction('/api/stats', decodeCounts, {
      signal,
      fresh: refresh,
    });
}
export const reference = new ReferenceRepository(apiClient);

const words = (a: string, b: string) => a.localeCompare(b, 'en-AU');

/**
 * A source's reader name: the summary's pipeline tags ("(zenodo)",
 * "(openaustralia)") and plus signs go, and state abbreviations are spelt
 * out where the name is the parliament's.
 */
export function sourceName(name: string): string {
  return name
    .replace(/\s*\((?:[a-z]+|recent refresh)\)\s*$/, '')
    .replace(/\bTheyVoteForYou\b/g, 'They Vote For You')
    .replace(/\s*\+\s*(?=[A-Za-z])/g, ' and ')
    .replace(/^QLD Parliament$/, 'Queensland Parliament')
    .replace(/^SA Parliament$/, 'South Australian Parliament')
    .trim();
}
/** A coverage window without its refresh words: "2015–2026", "14 Nov 2025". */
export function coverageWindow(text: string): string {
  return text
    .replace(/\s+(?:snapshot|refresh)\b/gi, '')
    .replace(/(\d{4})\s*[-–]\s*(\d{4})/g, '$1–$2')
    .trim();
}
const federal = (name: string) => /^Federal\b/.test(name);
const parliament = (name: string) =>
  /(?:Parliament|Legislative Assembly)$/.test(name) && !federal(name);
const speechSource = (name: string) =>
  /Hansard|Parliament|Legislative Assembly|committee hearings/i.test(name) &&
  !/divisions|representation/i.test(name);

export interface CoverageSource {
  name: string;
  window: string;
  detail: string;
}
/**
 * One row per source: Federal first, then the state parliaments, then the
 * other sources, each group A to Z.
 */
export function coverageSources(corpus: Corpus): CoverageSource[] {
  const rank = (name: string) => (federal(name) ? 0 : parliament(name) ? 1 : 2);
  return corpus.sources
    .map((source) => {
      const name = sourceName(source.name);
      const n = source.docs;
      return {
        name,
        window: coverageWindow(source.coverage),
        detail: speechSource(name)
          ? coverageCopy.speeches(n)
          : coverageCopy.records(n),
      };
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || words(a.name, b.name));
}

/** "NSW Parliament from 2015", for each state parliament the summary holds. */
export function stateCoverage(corpus: Corpus): string[] {
  return coverageSources(corpus)
    .filter((source) => parliament(source.name))
    .flatMap((source) => {
      const year = /\d{4}/.exec(source.window)?.[0];
      return year ? [`${source.name} from ${year}`] : [];
    });
}

export interface CountRow {
  label: string;
  value: number;
}
/** Named rows, largest first; anything unnamed summed into one last row. */
function named(
  counts: Readonly<Record<string, number>>,
  names: Readonly<Record<string, string>>,
  other: string,
): CountRow[] {
  const rows = new Map<string, number>();
  let rest = 0;
  for (const [id, value] of Object.entries(counts)) {
    const label = names[id];
    if (label) rows.set(label, (rows.get(label) ?? 0) + value);
    else rest += value;
  }
  const sorted = [...rows]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || words(a.label, b.label));
  return rest > 0 ? [...sorted, { label: other, value: rest }] : sorted;
}
export const kindRows = (counts: Counts): CountRow[] | null =>
  counts.kinds
    ? named(counts.kinds, kindNames, coverageCopy.otherRecords)
    : null;
export const parliamentRows = (counts: Counts): CountRow[] | null =>
  counts.speeches_by_state
    ? named(
        counts.speeches_by_state,
        parliamentNames,
        coverageCopy.otherParliaments,
      )
    : null;
