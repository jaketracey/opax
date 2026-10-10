import { useRefreshCommand } from '../../design/keyboard';
import { headerItems } from '../../navigation/chrome';
import { useEffect, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
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
  type SourceOriginal,
} from '../../design/primitives';
import type { DateInput } from '../../design/format';
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
      citation={meta.source}
      savedAt={record?.stale ? record.savedAt : null}
      originals={
        originals ??
        (meta.sourceUrl ? [{ label: meta.source, url: meta.sourceUrl }] : [])
      }
      notes={[meta.coverage, meta.threshold, ...meta.caveats, ...notes]}
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
  const originals: SourceOriginal[] = [
    ...(url ? [{ label: register, url, record: record ?? undefined }] : []),
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
      citation={register}
      coverage={record}
      originals={originals}
      notes={notes}
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
          </Group>
        )}
      />
    </SidebarSafe>
  );
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
