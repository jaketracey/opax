import { TwoSlotStore } from '../../storage/two-slot';

/**
 * Where Today's records line counts from: the copy of the collection
 * record the reader was last told of, as its total and its own check date
 * (`/corpus.json`: `expected_resources` and `refresh.checked_at`).
 *
 * Device-only: it is not an analytics property, it rides on no request and
 * it is not a new data type. The line is worked out on the device from
 * this file and the public collection record.
 *
 * No time of a visit is kept. Builds 77 to 82 saved one (`openedAt`) with
 * each record; nothing reads it now, so it is no longer written, and a
 * record that still has one reads as its total and date alone.
 */
export interface Visit {
  /** The collection's total records in that copy. */
  total: number;
  /** That copy's own check date. */
  checkedAt: string;
}
interface VisitFile extends Visit {
  version: 1;
}

const store = new TwoSlotStore<VisitFile>(
  ['opax-today-visit-v1.json', 'opax-today-visit-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    // An older record's `openedAt` is not read and not carried on.
    const { version, total, checkedAt } = raw as Record<string, unknown>;
    return version === 1 &&
      typeof total === 'number' &&
      Number.isSafeInteger(total) &&
      total >= 0 &&
      typeof checkedAt === 'string'
      ? { version: 1, total, checkedAt }
      : null;
  },
  (value) => value,
);

/** The copy last kept, or null on the first ever launch. */
export async function readVisit(): Promise<Visit | null> {
  const file = await store.read().catch(() => null);
  return file ? { total: file.total, checkedAt: file.checkedAt } : null;
}

/** Keeps this copy for the next launch; a failed save changes nothing. */
export async function rememberVisit(visit: Visit): Promise<void> {
  // Only the total and its date: nothing else a caller holds is written.
  await store
    .save({ version: 1, total: visit.total, checkedAt: visit.checkedAt })
    .catch(() => undefined);
}

/**
 * How old the collection record's own check date may be for the line to
 * cite it: 14 days. The record is stamped every night, so an older one
 * means the refresh has stopped, and a count dated weeks ago is not news.
 * Past the limit the line is not shown at all.
 */
export const SOURCE_LIMIT_DAYS = 14;
const SOURCE_LIMIT_MS = SOURCE_LIMIT_DAYS * 24 * 60 * 60 * 1000;

/** Whether a record checked at `checkedAt` was within the limit at `at`. */
export function sourceCurrent(checkedAt: string, at: number): boolean {
  const checked = Date.parse(checkedAt);
  return Number.isFinite(checked) && at - checked <= SOURCE_LIMIT_MS;
}

/**
 * How many more records the collection holds than at the last visit: the
 * change in its stated total, never less than 0 and 0 with no last visit.
 */
export function moreSince(visit: Visit | null, total: number): number {
  return visit ? Math.max(0, total - visit.total) : 0;
}
