import { StyleSheet, View } from 'react-native';
import type { Block, EditionView } from '../../api/catalogs';
import type {
  recentBillsFor,
  recentDeclarationsFor,
} from '../../api/selectors';
import { calendarDate, formatDate } from '../../design/format';
import {
  Section,
  SourceLine,
  Text,
  type SourceDetails,
  type SourceOriginal,
} from '../../design/primitives';
import { rhythm } from '../../design/tokens';

type Bills = NonNullable<ReturnType<typeof recentBillsFor>['data']>;
type Declarations = NonNullable<
  ReturnType<typeof recentDeclarationsFor>['data']
>;
export interface TodayFeeds {
  bills: Block<Bills>;
  declarations: Block<Declarations>;
}

const day = (value: string | null) => {
  const date = value ? calendarDate(value) : null;
  return date
    ? `${date.year}-${String(date.month + 1).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
    : null;
};
const ready = <T,>(block: Block<T> | null | undefined): block is Block<T> =>
  !!block && block.status === 'ready' && block.data !== null;

/**
 * What Today's one source line says and its sheet lists: the date the whole
 * page is current to (the oldest of its feeds' as-at dates, so no feed is
 * newer than it says), every source by name, the original records shown
 * (the bill records, each declaration's register page, the edition's page),
 * and a note per block with its own date. A saved copy or a partial export
 * anywhere on the page is the line's state.
 */
export function todaySources(
  feeds: TodayFeeds | null,
  edition: Block<EditionView> | null,
): SourceDetails {
  const bills = ready(feeds?.bills) ? feeds!.bills : null;
  const declarations = ready(feeds?.declarations) ? feeds!.declarations : null;
  const shown = ready(edition) ? edition.data! : null;
  const dates = [bills?.asAt ?? null, declarations?.asAt ?? null]
    .map(day)
    .filter((date): date is string => !!date)
    .sort();
  const asOf = dates[0] ?? (shown ? day(shown.date) : null);
  const originals: SourceOriginal[] = [
    ...(bills?.sources ?? []),
    ...(declarations?.data ?? []).map((item) => ({
      label: item.sourceLabel,
      url: item.url,
      record: `${item.name}${item.page !== null ? `, page ${item.page}` : ''}`,
    })),
    ...(shown
      ? [
          {
            label: 'OPAX daily edition',
            url: shown.path,
            record: `${shown.kindLabel}, ${formatDate(shown.date)}`,
          },
        ]
      : []),
  ];
  const citation = [
    ...new Set([
      ...(bills?.sources ?? []).map((source) => source.label),
      ...(declarations?.sources ?? []).map((source) => source.label),
      ...(shown ? ['OPAX daily edition'] : []),
    ]),
  ];
  const asAt = (block: Block<unknown>) =>
    block.asAt ? `as at ${formatDate(block.asAt)}` : 'date not published';
  const blocks: Block<unknown>[] = [
    bills,
    declarations,
    shown ? edition : null,
  ].filter((block) => block !== null);
  const saved = blocks
    .filter((block) => block.stale && block.savedAt !== null)
    .map((block) => block.savedAt!);
  return {
    asOf,
    citation,
    originals,
    savedAt: saved.length ? Math.min(...saved) : null,
    state: saved.length
      ? 'saved'
      : blocks.some((block) => block.partial)
        ? 'partial'
        : null,
    notes: [
      bills
        ? `New in parliament: the most recently introduced bills, from ${bills.sources.map((s) => s.label).join(' and ') || 'the bills index'}, ${asAt(bills)}.`
        : null,
      declarations
        ? `Just declared: the newest alterations to the registers of interests, ${asAt(declarations)}. Each entry is in the member’s own words.`
        : null,
      shown
        ? `Daily edition: OPAX’s post for ${formatDate(shown.date)}, shown as it was posted.`
        : null,
      ...(shown?.sourceRows ?? []),
    ],
  };
}

/**
 * The foot of Today: one source line for the page (it replaces the feeds'
 * own "Updated" lines and the coverage block), then the independence line
 * (design review D4: it moved here from the masthead) and the reminder that
 * patterns are leads.
 */
export function TodayFoot({
  feeds,
  edition,
}: {
  feeds: TodayFeeds | null;
  edition: Block<EditionView> | null;
}) {
  const sources = todaySources(feeds, edition);
  return (
    <Section testID="today-foot">
      <View style={styles.foot}>
        {/* Drawn once a block has loaded: until then nothing on the page
            needs a date or a source. */}
        {sources.citation?.length ? (
          <SourceLine
            title="Today’s sources"
            {...sources}
            testID="today-sources"
          />
        ) : null}
        <Text wordSafe variant="fine" testID="today-independence">
          OPAX is independent and non-partisan. It is not a government app.
        </Text>
        <Text wordSafe variant="fine" testID="today-screen-footer">
          Patterns in the public record are leads, not findings. Check the
          linked sources.
        </Text>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  foot: { gap: rhythm.tight },
});
