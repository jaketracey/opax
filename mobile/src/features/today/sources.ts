import type { Block, RecentBillsKind } from '../../api/catalogs';
import type {
  recentBillsFor,
  recentDeclarationsFor,
} from '../../api/selectors';
import { calendarDate } from '../../design/format';
import type { SourceDetails, SourceOriginal } from '../../design/source';
import type { RecentDivisions } from './votes';
import { VOTES_RULE } from './votes';

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

/** The short publisher names Today's lines show (in tint, never bronze). */
export const publishers = {
  bills: 'ParlInfo',
  declarations: 'Registers of interests',
  votes: 'They Vote For You',
  edition: 'OPAX daily edition',
} as const;

/** Today's rule texts, word for word (today.md 7.2, DIR 5.12). */
export const rules = {
  billsNew: 'Newest introduced first.',
  billsPassed: 'Newest passed or given Royal Assent first.',
  declarations: 'Newest declarations first, from both registers.',
  votes: VOTES_RULE,
  archive:
    'A different year each day, from 1998 to 2026, in order. Photographs of protests and party events are left out.',
  question: 'A different question each day, in order, from a reviewed set.',
  ask: 'Two questions a day, in order, from a reviewed list.',
} as const;

/**
 * A feed's line and sheet: "Updated {d MMM yyyy} · {publisher}", the
 * publisher's full title and date in the sheet, the originals, the rule,
 * and the state ("Saved {d MMM yyyy}" or " · partial") in the line itself.
 */
function feedSources<T>(
  block: Block<T>,
  label: string,
  originals: readonly SourceOriginal[],
  rule: string,
): SourceDetails {
  const title = block.sources[0]?.label;
  return {
    asOf: block.asAt,
    citation: [{ label, title: title ?? label, asOf: block.asAt }],
    originals,
    rule,
    savedAt: block.stale ? block.savedAt : null,
    state:
      block.stale && block.savedAt !== null
        ? 'saved'
        : block.partial
          ? 'partial'
          : null,
  };
}

/** Bills: "Updated {d MMM yyyy} · ParlInfo", with the segment's rule. */
export function billsSources(
  block: Block<Bills>,
  kind: RecentBillsKind = 'new',
): SourceDetails {
  return feedSources(
    block,
    publishers.bills,
    block.sources.map((s) => ({ ...s, asOf: block.asAt })),
    kind === 'passed' ? rules.billsPassed : rules.billsNew,
  );
}

/** Just declared: each chamber's register page, once, with the file's date. */
export function declarationsSources(block: Block<Declarations>): SourceDetails {
  const seen = new Set<string>();
  const originals: SourceOriginal[] = [];
  for (const item of block.data ?? []) {
    if (seen.has(item.sourceLabel)) continue;
    seen.add(item.sourceLabel);
    originals.push({
      label: item.sourceLabel,
      url: item.url,
      asOf: block.asAt,
    });
  }
  return feedSources(
    block,
    publishers.declarations,
    originals,
    rules.declarations,
  );
}

/** How parliament voted: "Updated {d MMM yyyy} · They Vote For You". */
export function votesSources(block: Block<RecentDivisions>): SourceDetails {
  return feedSources(
    block,
    publishers.votes,
    block.sources.map((s) => ({ ...s, asOf: block.asAt })),
    rules.votes,
  );
}

/** The oldest of several dates, so a combined line never overstates freshness. */
export function oldestDate(
  dates: readonly (string | null | undefined)[],
): string | null {
  return (
    dates
      .map((d) => (d ? day(d) : null))
      .filter((d): d is string => !!d)
      .sort()[0] ?? null
  );
}
