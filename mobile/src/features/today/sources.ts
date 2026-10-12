import type { Block, EditionView } from '../../api/catalogs';
import type {
  recentBillsFor,
  recentDeclarationsFor,
} from '../../api/selectors';
import { calendarDate, formatDate, sourceName } from '../../design/format';
import type { SourceDetails, SourceOriginal } from '../../design/primitives';

type Bills = NonNullable<ReturnType<typeof recentBillsFor>['data']>;
type Declarations = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>;

/** "2026-10-04": the calendar day a date names, or null. */
export const day = (value: string | null | undefined) => {
  const date = value ? calendarDate(value) : null;
  return date
    ? `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
    : null;
};

/**
 * What a feed's own source line says: the feed's as-at date, its sources by
 * name (each dated with the feed, so the sheet says whose date it is), a
 * saved copy or a partial export as its state, and the feed's note.
 */
function feedSources<T>(
  block: Block<T>,
  originals: readonly SourceOriginal[],
  note: string,
): SourceDetails {
  return {
    asOf: block.asAt,
    citation: [...new Set(block.sources.map((source) => source.label))].map(
      (label) => ({ ...sourceName(label), asOf: block.asAt }),
    ),
    originals,
    savedAt: block.stale ? block.savedAt : null,
    state:
      block.stale && block.savedAt !== null
        ? 'saved'
        : block.partial
          ? 'partial'
          : null,
    notes: [note],
  };
}

/** New in parliament's line: the bills index and its date. */
export function billsSources(block: Block<Bills>): SourceDetails {
  return feedSources(
    block,
    block.sources,
    `The most recently introduced bills, from ${block.sources.map((s) => s.label).join(' and ') || 'the bills index'}.`,
  );
}

/** Just declared's line: the registers, each declaration's register page. */
export function declarationsSources(block: Block<Declarations>): SourceDetails {
  return feedSources(
    block,
    (block.data ?? []).map((item) => ({
      label: item.sourceLabel,
      url: item.url,
      record: `${item.name}${item.page !== null ? `, page ${item.page}` : ''}`,
    })),
    'The newest alterations to the registers of interests. Each entry is in the member’s own words, as declared, not verified by OPAX.',
  );
}

/**
 * What the foot's source line says: the daily edition's own source and
 * date, its page and the edition's own source notes. The feeds carry their
 * own lines, so no page-wide date stands for blocks of different ages.
 */
export function editionSources(edition: EditionView): SourceDetails {
  return {
    asOf: day(edition.date),
    citation: [{ label: 'OPAX daily edition', asOf: day(edition.date) }],
    originals: [
      {
        label: 'OPAX daily edition',
        url: edition.path,
        record: `${edition.kindLabel}, ${formatDate(edition.date)}`,
      },
    ],
    notes: [
      `OPAX’s post for ${formatDate(edition.date)}, shown as it was posted.`,
      ...edition.sourceRows,
    ],
  };
}
