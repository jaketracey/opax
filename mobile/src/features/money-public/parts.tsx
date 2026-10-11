import { useRefreshCommand } from '../../design/keyboard';
import { headerItems } from '../../navigation/chrome';
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  useScreenColumn,
  useLayout,
  gridColumns,
  SidebarSafe,
  RegionProvider,
  Divider,
  EmptyState,
  Group,
  Heading,
  ChoiceChips,
  SourceLine,
  Text,
  type SourceCitation,
  type SourceOriginal,
} from '../../design/primitives';
import { formatDate, sourceName, type DateInput } from '../../design/format';
import { colors, layout, rhythm } from '../../design/tokens';
import { shareHeaderItem } from '../../navigation/share';
import type { decodeMeta } from './data';
export function MoneyHeader({ title, path }: { title: string; path: string }) {
  return (
    <Stack.Screen
      options={{
        title,
        headerTitle: '',
        ...headerItems(() => [shareHeaderItem({ title, path })]),
      }}
    />
  );
}
type Notes = readonly (string | null | undefined | false)[];

// The registers behind public money, by their publishers' short names (design
// pass 5, P2-5): the line says "AusTender", the sheet the full title, and
// neither says how the export was built ("Latest contract notice per
// amendment lineage"; the caveats say it in plain words).
const registers: [RegExp, SourceCitation][] = [
  [
    /^AusTender\b/i,
    { label: 'AusTender', title: 'AusTender, Department of Finance' },
  ],
  [
    /^GrantConnect\b/i,
    {
      label: 'GrantConnect',
      title: 'GrantConnect grant awards, Department of Finance',
    },
  ],
  [
    /^(QLD|Queensland) Government Investment Portal\b/i,
    {
      label: 'Queensland Government Investment Portal',
      title: 'Queensland Government Investment Portal (data.qld.gov.au)',
    },
  ],
  [
    /^Centre for Public Integrity\b/i,
    {
      label: 'Centre for Public Integrity',
      title: 'Centre for Public Integrity, Table 3',
    },
  ],
  [
    /^AEC seat status\b/i,
    { label: 'AEC seat status', title: 'AEC seat status, 2025 election' },
  ],
];
/** A money export's raw source as `{ label, title }` for a SourceLine. */
export function moneyCitation(raw: string): SourceCitation {
  const text = raw.trim();
  const known = registers.find(([pattern]) => pattern.test(text));
  return known ? known[1] : sourceName(text);
}
/** The short publisher name for a row's source and its original's label. */
export const moneyRegister = (raw: string) => moneyCitation(raw).label;

const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/g;
/**
 * An export's note with its ISO dates read as dates ("awards published 30
 * Mar 2011 to 1 May 2028"), as the date rule asks (design pass 5, P3-12).
 */
export function readableDates<T extends string | null | undefined | false>(
  note: T,
): T {
  return (
    typeof note === 'string'
      ? note.replace(isoDate, (iso) => formatDate(iso, 'short') || iso)
      : note
  ) as T;
}
/** A whole-screen catalog record's saved state, for the source line. */
type Saved = { stale: boolean; savedAt: number | null } | null | undefined;

/**
 * A list's one source line, under its figure or count: the export's date
 * and register ("Updated 4 Oct 2026 · GrantConnect"), "Saved …" on a saved
 * copy. The sheet holds the register, the coverage, threshold and caveats in
 * full, and the licence.
 */
export function MetaSource({
  meta,
  record,
  notes = [],
  originals,
  title,
  testID,
}: {
  meta: ReturnType<typeof decodeMeta>;
  record?: Saved;
  /** Notes after the export's own coverage, threshold and caveats. */
  notes?: Notes;
  /** Defaults to the export's register. */
  originals?: readonly SourceOriginal[];
  title?: string;
  testID: string;
}) {
  return (
    <SourceLine
      title={title}
      asOf={meta.asOf}
      citation={[moneyCitation(meta.source)]}
      savedAt={record?.stale ? record.savedAt : null}
      originals={
        originals ??
        (meta.sourceUrl
          ? [{ label: moneyRegister(meta.source), url: meta.sourceUrl }]
          : [])
      }
      notes={[meta.coverage, meta.threshold, ...meta.caveats, ...notes].map(
        readableDates,
      )}
      licence={meta.licence}
      testID={testID}
    />
  );
}

/**
 * One record's own source in a list row, after the list's dated source
 * line: the register and the record's ID ("GrantConnect · GA123456"). Its
 * sheet opens the original, says the export's date, carries the row's own
 * notes, and for an organisation opens its page on opax.com.au.
 */
export function RowSource({
  register,
  record,
  url,
  asOf,
  notes,
  organisation,
  testID,
}: {
  register: string;
  /** The register's own ID: "GA123456", "CN3407266". */
  record?: string | null;
  url?: string | null;
  asOf: DateInput | null | undefined;
  notes?: Notes;
  /** The organisation's page on opax.com.au. */
  organisation?: { name: string; path: string } | null;
  testID?: string;
}) {
  const name = moneyCitation(register);
  const originals: SourceOriginal[] = [
    ...(url ? [{ label: name.label, url, record: record ?? undefined }] : []),
    ...(organisation
      ? [
          {
            label: 'opax.com.au',
            url: organisation.path,
            record: organisation.name,
          },
        ]
      : []),
  ];
  return (
    <SourceLine
      title="This record"
      dateLabel={null}
      asOf={asOf}
      citation={[name]}
      coverage={record}
      originals={originals}
      notes={notes?.map(readableDates)}
      testID={testID}
    />
  );
}
export function MoneyChoices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly (readonly [T, string, string?])[];
}) {
  return (
    <ChoiceChips
      value={value}
      onChange={onChange}
      segments={options.map(([value, label, testID]) => ({
        value,
        label,
        testID,
      }))}
    />
  );
}
export function MoneyList<T>({
  rows,
  rowKey,
  render,
  header,
  footer,
  sourceLine,
  refreshing,
  refresh,
  id,
  loaded,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  render: (row: T, index: number) => ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  /**
   * The list's one source line, at the foot of its first page (design pass
   * 5, P3-9): under the first rows, or at the list's end when it is short
   * or empty. Never above the list.
   */
  sourceLine?: ReactNode;
  refreshing: boolean;
  refresh: () => void;
  id: string;
  loaded: boolean;
}) {
  const column = useScreenColumn('wide');
  const adaptive = useLayout();
  const { fontScale } = useWindowDimensions();
  const count = gridColumns(column.inner?.width ?? adaptive.width, {
    columns: { regular: 2, wide: 2 },
    minItemWidth: 320 * Math.min(Math.max(fontScale, 1), 2),
  });
  useRefreshCommand(refresh, refreshing);
  const sourceAt = sourceLine ? sourceIndex(rows.length, count) : -1;
  return (
    <SidebarSafe style={styles.screen}>
      <FlatList
        key={`columns-${count}`}
        numColumns={count}
        columnWrapperStyle={count > 1 ? { gap: rhythm.block } : undefined}
        data={rows}
        keyExtractor={rowKey}
        testID={id}
        style={styles.screen}
        contentContainerStyle={[styles.content, column.content]}
        onLayout={column.onLayout}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        ListHeaderComponent={
          <RegionProvider value={column.inner}>
            {column.bar}
            <Group>{header}</Group>
          </RegionProvider>
        }
        ListFooterComponent={
          <Group>
            {sourceLine && sourceAt < 0 && loaded ? (
              <View testID={`${id}-source-foot`}>{sourceLine}</View>
            ) : null}
            {footer}
            <Text wordSafe variant="fine" testID={`${id}-end`}>
              End of record
            </Text>
          </Group>
        }
        ListEmptyComponent={
          loaded ? (
            <EmptyState message="No matching records in the available export." />
          ) : null
        }
        renderItem={({ item, index }) => (
          <Group
            style={[styles.row, count > 1 ? { flex: 1, minWidth: 0 } : null]}
          >
            {render(item, index)}
            <Divider variant="subtle" />
            {index === sourceAt ? (
              <View testID={`${id}-source-foot`}>{sourceLine}</View>
            ) : null}
          </Group>
        )}
      />
    </SidebarSafe>
  );
}
/** A list's first page: ten rows, or ten rows of a grid. */
export const FIRST_PAGE = 10;
/**
 * The row the list's source line follows: the last row of the first page,
 * in the first column of a grid (so it reads under the page, not beside
 * it), or -1 for an empty list, whose foot holds the line instead.
 */
export function sourceIndex(rows: number, columns = 1): number {
  if (!rows) return -1;
  const last = Math.min(FIRST_PAGE * columns, rows) - 1;
  return last - (last % columns);
}
export function ResultCount({
  count,
  noun,
  detail,
}: {
  count: number | null;
  noun: string;
  /** Coverage the count needs: "1,024 in the source totals". */
  detail?: string | null;
}) {
  useEffect(() => {
    if (count === null) return;
    const timer = setTimeout(
      () =>
        AccessibilityInfo.announceForAccessibility(
          `${count.toLocaleString('en-AU')} ${noun}`,
        ),
      350,
    );
    return () => clearTimeout(timer);
  }, [count, noun]);
  if (count === null) return null;
  return (
    <Text wordSafe variant="metadata" accessibilityLiveRegion="polite">
      {count.toLocaleString('en-AU')} {noun}
      {detail ? ` · ${detail}` : ''}
    </Text>
  );
}
/** The screen's one title, in ink: the accent is for the figure and marks. */
export function Title({ children, id }: { children: ReactNode; id: string }) {
  return (
    <Heading level={1} testID={id}>
      {children}
    </Heading>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
    gap: rhythm.block,
  },
  row: { paddingVertical: rhythm.tight },
});
