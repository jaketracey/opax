import { TwoSlotStore } from '../../storage/two-slot';

/**
 * The reader's last visit, for Today's "since your last visit" line: when
 * the app was last opened, and the size of the collection then, as its own
 * record stated it (`/corpus.json`: `expected_resources` and
 * `refresh.checked_at`).
 *
 * Device-only. The last-open time is never sent anywhere: it is not an
 * analytics property, it rides on no request and it is not a new data type.
 * The line is worked out on the device from this file and the public
 * collection record.
 */
export interface Visit {
  /** When the app was last opened, in ms. Never leaves the device. */
  openedAt: number;
  /** The collection's total records at that visit. */
  total: number;
  /** The collection record's own check date at that visit. */
  checkedAt: string;
}
interface VisitFile extends Visit {
  version: 1;
}

const store = new TwoSlotStore<VisitFile>(
  ['opax-today-visit-v1.json', 'opax-today-visit-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, openedAt, total, checkedAt } = raw as Record<
      string,
      unknown
    >;
    return version === 1 &&
      typeof openedAt === 'number' &&
      Number.isFinite(openedAt) &&
      typeof total === 'number' &&
      Number.isSafeInteger(total) &&
      total >= 0 &&
      typeof checkedAt === 'string'
      ? { version: 1, openedAt, total, checkedAt }
      : null;
  },
  (value) => value,
);

/** The last visit kept, or null on the first ever launch. */
export async function readVisit(): Promise<Visit | null> {
  const file = await store.read().catch(() => null);
  return file
    ? { openedAt: file.openedAt, total: file.total, checkedAt: file.checkedAt }
    : null;
}

/** Keeps this visit for the next launch; a failed save changes nothing. */
export async function rememberVisit(visit: Visit): Promise<void> {
  await store.save({ version: 1, ...visit }).catch(() => undefined);
}

/**
 * The collection is refreshed once a night. A copy checked this long ago
 * has very likely been replaced, so a line is worth holding a place for.
 */
export const REFRESH_AFTER_MS = 20 * 60 * 60 * 1000;

/**
 * Whether a newer collection record has likely been published since the
 * last visit: decided from the disk alone, before any request, so Today
 * knows on its first frame whether to hold the line's place.
 */
export function refreshLikely(visit: Visit, now: number): boolean {
  const checked = Date.parse(visit.checkedAt);
  return Number.isFinite(checked) && now - checked >= REFRESH_AFTER_MS;
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
 * Whether a line is likely this visit, so its place is worth holding:
 * a newer record has likely been published, and the record was within the
 * limit when the last visit read it (one already stale then is likely
 * stale still, and would hold a place that no line fills).
 */
export function lineLikely(visit: Visit, now: number): boolean {
  return (
    refreshLikely(visit, now) && sourceCurrent(visit.checkedAt, visit.openedAt)
  );
}

/**
 * How many more records the collection holds than at the last visit: the
 * change in its stated total, never less than 0 and 0 with no last visit.
 */
export function moreSince(visit: Visit | null, total: number): number {
  return visit ? Math.max(0, total - visit.total) : 0;
}
