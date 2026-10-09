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
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  Group,
  LoadingState,
  LinkRow,
  InfoButton,
  StaleNotice,
  Text,
  errorMessage,
  useAccessibilitySize,
} from '../../design/primitives';
import { colors, layout, rhythm } from '../../design/tokens';
import { formatCount, formatDate } from '../../design/format';
import { CHAMBER_NOT_RECORDED, chamberName } from '../../design/parliament';
import { billFoldText } from '../../api/bill-transforms';
import { billRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { SavedCopyNotice, PartialNotice } from '../CatalogNotice';
import { loadDivisionHistory } from './division-data';
import type { DivisionRow } from './model';
const Division = memo(function Division({ item }: { item: DivisionRow }) {
  const stacked = useAccessibilitySize();
  const key = `${item.billKey}-${item.key.split(':').slice(1).join('-')}`;
  return (
    <View>
      <LinkRow
        icon={stacked ? undefined : 'checkmark.seal'}
        accent="votes"
        title={item.title}
        testID={`division-history-${key}`}
        titleTestID={`division-title-${key}`}
        detailTestID={`division-details-${key}`}
        detail={[
          formatDate(item.date),
          chamberName(item.house, 'federal') ?? CHAMBER_NOT_RECORDED,
          `${formatCount(item.ayes)} ayes · ${formatCount(item.noes)} noes`,
        ]
          .filter(Boolean)
          .join('\n')}
        onPress={() => router.push(billRoute(item.billKey, 'divisions'))}
      />
      {item.question ? (
        <View style={styles.question}>
          <InfoButton
            title="Division question"
            notes={[item.question, `${item.title} · ${formatDate(item.date)}`]}
            testID={`division-question-${key}`}
          />
        </View>
      ) : null}
    </View>
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
            billFoldText(`${r.title} ${r.question} ${r.date}`).includes(t),
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
              <>
                <View style={styles.summary}>
                  <Text
                    variant="metadata"
                    testID="division-history-count"
                    style={styles.grow}
                  >
                    {formatCount(rows.length)} division records · newest first
                  </Text>
                  <InfoButton
                    title="About division history"
                    notes={divisionNotes}
                    testID="division-history-info"
                  />
                </View>
                <Text variant="fine" testID="division-history-coverage">
                  {complete && !record.failed
                    ? 'All bill files loaded'
                    : `${formatCount(record.loaded)} of ${formatCount(record.total)} bill files loaded${record.failed ? `; ${formatCount(record.failed)} unavailable` : ''}`}
                </Text>
                {record.failed ? (
                  <Button
                    label="Try again"
                    testID="division-history-retry"
                    onPress={refresh}
                  />
                ) : null}
                {record.stale ? (
                  <>
                    <SavedCopyNotice />
                    <StaleNotice
                      savedAt={record.savedAt}
                      refreshing={refreshing}
                    />
                  </>
                ) : null}
                {record.partial ? <PartialNotice /> : null}
                <AsAtLine
                  asOf={record.asAt}
                  citation="ParlInfo bill records; They Vote For You, ODbL"
                  savedAt={record.stale ? record.savedAt : null}
                />
              </>
            ) : !error ? (
              <LoadingState label="Loading division history" />
            ) : null}
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
  summary: { flexDirection: 'row', alignItems: 'center', gap: rhythm.tight },
  grow: { flex: 1 },
  header: { paddingBottom: rhythm.block },
  question: { alignItems: 'flex-end', paddingBottom: rhythm.tight },
});
