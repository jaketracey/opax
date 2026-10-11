import { divisionNotes } from './notes';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { router, Stack } from 'expo-router';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  Group,
  LoadingState,
  LinkRow,
  BillRow,
  SidebarSafe,
  SourceLine,
  Text,
  errorMessage,
  useScreenColumn,
} from '../../design/primitives';
import { colors, layout, rhythm } from '../../design/tokens';
import { formatCount, formatDate } from '../../design/format';
import { CHAMBER_NOT_RECORDED, chamberName } from '../../design/parliament';
import { billFoldText } from '../../api/bill-transforms';
import { catalogSources } from '../../api/catalogs';
import { billRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { SavedCopyNotice } from '../CatalogNotice';
import { loadDivisionHistory } from './division-data';
import type { DivisionRow } from './model';

const outcomeWords = (outcome: string) =>
  outcome === 'affirmative'
    ? 'Agreed to'
    : outcome === 'negative'
      ? 'Negatived'
      : outcome
        ? outcome[0]!.toUpperCase() + outcome.slice(1)
        : 'Outcome not recorded';

/** The list's items: a bill's line, then its consecutive divisions. */
export type HistoryItem =
  | { type: 'bill'; key: string; billKey: string; title: string; count: number }
  | { type: 'division'; key: string; row: DivisionRow }
  | { type: 'source'; key: 'source' };

/** The list's source line sits under its first page, not above the rows. */
export const SOURCE_AFTER = 10;

/**
 * Consecutive divisions of one bill under one line for the bill (pass 5,
 * P2-10), so a run of divisions is not titled by the same bill four times.
 * The source line follows the first page of divisions.
 */
export function historyItems(rows: readonly DivisionRow[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  let divisions = 0;
  let line: Extract<HistoryItem, { type: 'bill' }> | null = null;
  for (const row of rows) {
    if (divisions === SOURCE_AFTER)
      items.push({ type: 'source', key: 'source' });
    if (!line || line.billKey !== row.billKey) {
      line = {
        type: 'bill',
        key: `bill:${row.key}`,
        billKey: row.billKey,
        title: row.title,
        count: 0,
      };
      items.push(line);
    }
    line.count++;
    items.push({ type: 'division', key: row.key, row });
    divisions++;
  }
  if (!items.some((item) => item.type === 'source'))
    items.push({ type: 'source', key: 'source' });
  return items;
}

/** How a division row is spoken: stage, outcome and count, where and when, and its bill. */
export function divisionLabel(item: DivisionRow) {
  return [
    item.stage ?? 'Division',
    outcomeWords(item.outcome),
    `${formatCount(item.ayes)} ayes, ${formatCount(item.noes)} noes`,
    divisionWhere(item),
    item.title,
  ].join(', ');
}
const divisionWhere = (item: DivisionRow) =>
  [
    chamberName(item.house, 'federal') ?? CHAMBER_NOT_RECORDED,
    formatDate(item.date, 'short'),
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * One division, titled by its stage ("Limitation of debate"), with its
 * outcome as a status and the count beside it, and "Senate · 20 Aug 2026"
 * under it. It opens the bill's divisions, where the question and the
 * party splits are. No icon tile and no ⓘ: the list's one source line
 * holds the notes.
 */
const Division = memo(function Division({ item }: { item: DivisionRow }) {
  const key = `${item.billKey}-${item.key.split(':').slice(1).join('-')}`;
  return (
    <BillRow
      title={item.stage ?? 'Division'}
      status={outcomeWords(item.outcome)}
      date={`${formatCount(item.ayes)} ayes, ${formatCount(item.noes)} noes`}
      detail={divisionWhere(item)}
      accessibilityLabel={divisionLabel(item)}
      accessibilityHint="Opens the bill's divisions"
      testID={`division-history-${key}`}
      onPress={() => router.push(billRoute(item.billKey, 'divisions'))}
    />
  );
});
/** The bill a run of divisions belongs to: a link row to the bill. */
const BillLine = memo(function BillLine({
  item,
}: {
  item: Extract<HistoryItem, { type: 'bill' }>;
}) {
  return (
    <LinkRow
      title={item.title}
      detail={
        item.count > 1 ? `${formatCount(item.count)} divisions` : undefined
      }
      testID={`division-history-bill-${item.billKey}`}
      onPress={() => router.push(billRoute(item.billKey))}
    />
  );
});
export default function DivisionHistory() {
  const load = useCallback(
    (refresh: boolean, publish: Parameters<typeof loadDivisionHistory>[1]) =>
      loadDivisionHistory(refresh, publish),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const column = useScreenColumn();
  const [text, setText] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 120);
    return () => clearTimeout(timer);
  }, [text]);
  const rows = useMemo(
    () =>
      record?.rows.filter((r) =>
        billFoldText(query)
          .split(' ')
          .filter(Boolean)
          .every((t) =>
            billFoldText(
              `${r.title} ${r.stage ?? ''} ${r.question} ${r.date}`,
            ).includes(t),
          ),
      ) ?? [],
    [record, query],
  );
  const items = useMemo(() => historyItems(rows), [rows]);
  const complete = record && record.loaded + record.failed === record.total;
  useEffect(() => {
    if (complete)
      AccessibilityInfo.announceForAccessibility(
        `${record.rows.length} division records loaded`,
      );
  }, [complete, record?.rows.length]);
  const source = record ? (
    <SourceLine
      title="About division history"
      asOf={record.asAt}
      citation={[catalogSources.bills.label, 'They Vote For You']}
      licence="They Vote For You: ODbL"
      licenceDataset="tvfy"
      savedAt={record.stale ? record.savedAt : null}
      state={record.partial ? 'partial' : null}
      notes={[
        ...divisionNotes,
        record.partial ? 'Some rows in this export could not be read.' : null,
      ]}
      testID="division-history-source"
    />
  ) : null;
  const renderItem = ({ item }: ListRenderItemInfo<HistoryItem>) =>
    item.type === 'bill' ? (
      <BillLine item={item} />
    ) : item.type === 'division' ? (
      <Division item={item.row} />
    ) : (
      <View style={styles.source}>{source}</View>
    );
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Division history',
          headerLargeTitleEnabled: false,
          unstable_headerRightItems: () => [
            shareHeaderItem({
              path: '/bills?view=divisions',
              title: 'Division history',
            }),
          ],
        }}
      />
      {/* The iPad sidebar floats over a bare list; this keeps rows clear of
          it, and on regular width the rows keep the readable column. */}
      <SidebarSafe style={styles.screen}>
        <FlatList
          testID="division-history-screen"
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content]}
          onLayout={column.onLayout}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          data={record && rows.length ? items : []}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews={false}
          ItemSeparatorComponent={() => <Divider variant="subtle" />}
          ListHeaderComponent={
            <Group>
              <Field
                label="Search division history"
                testID="division-history-search"
                value={text}
                onChangeText={setText}
                returnKeyType="search"
                onSubmitEditing={() => {
                  setQuery(text.trim());
                  Keyboard.dismiss();
                }}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {record ? (
                <Group gap={rhythm.line}>
                  <Text variant="metadata" testID="division-history-count">
                    {formatCount(rows.length)} division records · newest first
                  </Text>
                  {/* Loading is a state, not a caption: it goes once every
                      bill file is in, unless some could not be read. */}
                  {!complete || record.failed ? (
                    <Text variant="fine" testID="division-history-coverage">
                      {`${formatCount(record.loaded)} of ${formatCount(record.total)} bill files loaded${record.failed ? `; ${formatCount(record.failed)} unavailable` : ''}`}
                    </Text>
                  ) : null}
                  {/* With no rows the source line stays here; otherwise it
                      follows the first page (pass 5, P2-19). */}
                  {rows.length ? null : source}
                </Group>
              ) : !error ? (
                <LoadingState label="Loading division history" />
              ) : null}
              {record?.failed ? (
                <Button
                  label="Try again"
                  testID="division-history-retry"
                  onPress={refresh}
                />
              ) : null}
              {record?.stale ? <SavedCopyNotice /> : null}
              {error ? (
                <ErrorState message={errorMessage(error)} onRetry={retry} />
              ) : null}
            </Group>
          }
          ListHeaderComponentStyle={styles.header}
          ListEmptyComponent={
            complete ? (
              <EmptyState message="No division records match that search." />
            ) : null
          }
        />
      </SidebarSafe>
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
  },
  header: { paddingBottom: rhythm.block },
  source: { paddingVertical: rhythm.heading },
});
