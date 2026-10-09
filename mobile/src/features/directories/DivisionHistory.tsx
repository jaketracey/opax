import { divisionNotes } from './notes';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
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
  SidebarSafe,
  SourceLine,
  Text,
  errorMessage,
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

/**
 * One division: the bill, then its title (the recorded stage), chamber and
 * date, and the outcome with its counts. It opens the bill's divisions,
 * where the question and the party splits are. No icon tile and no ⓘ: the
 * list's one source line holds the notes.
 */
const Division = memo(function Division({ item }: { item: DivisionRow }) {
  const key = `${item.billKey}-${item.key.split(':').slice(1).join('-')}`;
  return (
    <LinkRow
      title={item.title}
      testID={`division-history-${key}`}
      titleTestID={`division-title-${key}`}
      detailTestID={`division-details-${key}`}
      detail={[
        [
          item.stage,
          chamberName(item.house, 'federal') ?? CHAMBER_NOT_RECORDED,
          formatDate(item.date, 'short'),
        ]
          .filter(Boolean)
          .join(' · '),
        `${outcomeWords(item.outcome)}, ${formatCount(item.ayes)} ayes, ${formatCount(item.noes)} noes`,
      ].join('\n')}
      onPress={() => router.push(billRoute(item.billKey, 'divisions'))}
    />
  );
});
const renderRow = ({ item }: ListRenderItemInfo<DivisionRow>) => (
  <Division item={item} />
);
export default function DivisionHistory() {
  const load = useCallback(
    (refresh: boolean, publish: Parameters<typeof loadDivisionHistory>[1]) =>
      loadDivisionHistory(refresh, publish),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
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
  const complete = record && record.loaded + record.failed === record.total;
  useEffect(() => {
    if (complete)
      AccessibilityInfo.announceForAccessibility(
        `${record.rows.length} division records loaded`,
      );
  }, [complete, record?.rows.length]);
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
      {/* The iPad sidebar floats over a bare list; this keeps rows clear of it. */}
      <SidebarSafe style={styles.screen}>
        <FlatList
          testID="division-history-screen"
          style={styles.screen}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          data={rows}
          renderItem={renderRow}
          keyExtractor={(r) => r.key}
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
                  <SourceLine
                    title="About division history"
                    asOf={record.asAt}
                    citation={[catalogSources.bills.label, 'They Vote For You']}
                    licence="They Vote For You: ODbL"
                    savedAt={record.stale ? record.savedAt : null}
                    state={record.partial ? 'partial' : null}
                    notes={[
                      ...divisionNotes,
                      record.partial
                        ? 'Some rows in this export could not be read.'
                        : null,
                    ]}
                    testID="division-history-source"
                  />
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
});
