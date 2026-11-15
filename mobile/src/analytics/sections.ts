/**
 * Section load failures (`opax_section_failed`, docs/ANALYTICS.md): a data
 * block that failed to load, or loaded with rows dropped. One report says
 * which block (a fixed key), how it failed (a fixed kind) and the route
 * template the reader was on. Nothing else: the request path, the record,
 * and the error's text all stay on the phone.
 *
 * Two shared places feed it, so no screen reports for itself: every catalog
 * read (the API client's `onFailure`, wired in api/runtime.ts) and every
 * record a screen loads through `useCatalogRecord` or `useRead`.
 *
 * This file imports nothing from the analytics client, so the API layer can
 * use it without loading the SDK. The client connects itself as the sink
 * (analytics/index.ts); until then, and in builds without analytics, reports
 * go nowhere.
 */
import { ApiError } from '../api/errors';
import type { FailedSection, SectionFailureKind } from './events';

/**
 * At most this many reports of each kind per launch, whatever fails. The
 * limit is per kind so a launch with no connection cannot use it up before a
 * decode or server failure.
 */
export const SECTION_REPORT_LIMIT = 12;

type Sink = {
  /** The route template the reader is on, from the fixed list. */
  route: () => string;
  send: (
    section: FailedSection,
    kind: SectionFailureKind,
    route: string,
  ) => void;
};
let sink: Sink | null = null;
const sent = new Set<string>();
const sentOfKind = new Map<SectionFailureKind, number>();

/** The analytics client connects itself here; null disconnects (tests). */
export function connectSectionReports(next: Sink | null) {
  sink = next;
  sent.clear();
  sentOfKind.clear();
}

/**
 * One report per section, kind and route for each launch: a retry loop, a
 * re-render or a second screen reading the same file adds nothing.
 */
export function reportSectionFailure(
  section: FailedSection,
  kind: SectionFailureKind,
) {
  try {
    if (!sink) return;
    const route = sink.route();
    const key = `${section}|${kind}|${route}`;
    const count = sentOfKind.get(kind) ?? 0;
    if (sent.has(key) || count >= SECTION_REPORT_LIMIT) return;
    sent.add(key);
    sentOfKind.set(kind, count + 1);
    sink.send(section, kind, route);
  } catch {
    /* Reporting never interrupts a read. */
  }
}
const report = reportSectionFailure;

/**
 * The failure kind an error stands for, or null for anything that is not a
 * failed read (a cancelled request, a refused path, an unknown error).
 */
export function failureKind(error: unknown): SectionFailureKind | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === 'offline' || error.code === 'timeout') return 'network';
  if (error.code === 'invalid-data') return 'decode';
  const status = error.status;
  if (typeof status !== 'number') return null;
  if (status >= 500 && status <= 599) return '5xx';
  if (status >= 400 && status <= 499) return '4xx';
  return null;
}

// First match wins. Only the family is kept: what follows the prefix (a
// person, a bill, a seat, a search phrase) is never read here.
const readSections: readonly (readonly [RegExp, FailedSection])[] = [
  [/^\/parliamentarians\.json$/, 'read_roster'],
  [/^\/api\/person-slugs$/, 'read_slugs'],
  [/^\/electorates\/manifest\.json$/, 'read_manifest'],
  [/^\/electorates\/releases\/[^/]+\/people\.json$/, 'read_people'],
  [/^\/electorates\//, 'read_electorates'],
  [/^\/bills(?:\/|$)/, 'read_bills'],
  [/^\/(?:votes\.json$|divisions\/)/, 'read_votes'],
  [/^\/graph\/(?:money|aec-extras)\b/, 'read_money'],
  [/^\/(?:graph\/grants\b|grants\/)/, 'read_grants'],
  [/^\/interests\//, 'read_interests'],
  [/^\/expense(?:s|-categories)\.json$/, 'read_expenses'],
  [/^\/pay\.json$/, 'read_pay'],
  [/^\/discovery\.json$/, 'read_discovery'],
  [/^\/evidence\//, 'read_evidence'],
  [/^\/agencies\.json$/, 'read_agencies'],
  [/^\/photos\//, 'read_photos'],
  [/^\/years\//, 'read_years'],
  [/^\/(?:research|reports|social)\//, 'read_research'],
  [/^\/search-catalog\//, 'read_search_catalog'],
  [/^\/api\/(?:report|topic|topics)(?:\/|$)/, 'read_reports'],
  [/^\/api\/search/, 'read_search'],
  [/^\/api\/resource(?:\/|$)/, 'read_record'],
  [/^\/api\//, 'read_api'],
];
/** The catalog family a request path belongs to. */
export function sectionForPath(path: string): FailedSection {
  const plain = path.replace(/[?#].*$/su, '');
  for (const [pattern, section] of readSections)
    if (pattern.test(plain)) return section;
  return 'read_other';
}

/**
 * The API client's `onFailure`: a read that threw, a read that failed while
 * the saved copy was shown instead, or a read with rows dropped.
 */
export function reportReadFailure(path: string, failure: unknown | 'partial') {
  try {
    const kind = failure === 'partial' ? failure : failureKind(failure);
    if (kind) report(sectionForPath(path), kind);
  } catch {
    /* optional */
  }
}

const blockSections: Record<string, FailedSection> = {
  members: 'block_members',
  representatives: 'block_members',
  past: 'block_past',
  receipts: 'block_receipts',
  partyReceipts: 'block_receipts',
  associated: 'block_associated',
  divisions: 'block_divisions',
  people: 'block_people',
  electorates: 'block_electorates',
  bills: 'block_bills',
  acts: 'block_bills',
  votes: 'block_votes',
  speeches: 'block_speeches',
  interests: 'block_interests',
  expenses: 'block_expenses',
  pay: 'block_pay',
  identity: 'block_identity',
  seat: 'block_seat',
};
const blockStates = ['ready', 'missing', 'error', 'loading', 'unlinked'];
function asBlock(
  value: unknown,
): { status: string; partial?: unknown; error?: unknown } | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return null;
  const block = value as { status?: unknown; sources?: unknown };
  return typeof block.status === 'string' &&
    blockStates.includes(block.status) &&
    Array.isArray(block.sources)
    ? (block as { status: string })
    : null;
}

/**
 * A loaded record's blocks (a party page's Members, Receipts and so on): one
 * report for each that is in its error state or says it is partial. Only
 * the block's property name is read, and only to choose a fixed key.
 */
export function reportRecordBlocks(record: unknown) {
  try {
    const data = (record as { data?: unknown } | null)?.data;
    if (data === null || typeof data !== 'object' || Array.isArray(data))
      return;
    for (const name of Object.keys(data)) {
      const block = asBlock((data as Record<string, unknown>)[name]);
      if (!block) continue;
      const kind =
        block.status === 'error'
          ? failureKind(block.error)
          : block.partial === true
            ? 'partial'
            : null;
      if (!kind) continue;
      report(
        Object.hasOwn(blockSections, name)
          ? blockSections[name]!
          : 'block_other',
        kind,
      );
    }
  } catch {
    /* optional */
  }
}

/** A whole page's read failed: nothing to draw but the error state. */
export function reportPageFailure(error: unknown) {
  try {
    const kind = failureKind(error);
    if (kind) report('page', kind);
  } catch {
    /* optional */
  }
}
