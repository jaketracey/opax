import { RecordRow } from '../RecordRow';
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
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  Group,
  LoadingState,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { colors, layout, spacing } from '../../design/tokens';
import { formatCount, formatDate } from '../../design/format';
import { chamberName } from '../../design/parliament';
import { billFoldText } from '../../api/bill-transforms';
import { billRoute } from '../../navigation/routes';
import { shareHeaderItem } from '../../navigation/share';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { SavedCopyNotice, PartialNotice } from '../CatalogNotice';
import { loadDivisionHistory } from './division-data';
import type { DivisionRow } from './model';
const Division = memo(function Division({ item }: { item: DivisionRow }) {
  return (
    <RecordRow
      title={item.title}
      testID={`division-history-${item.billKey}-${item.key.split(':').slice(1).join('-')}`}
      detail={[
        formatDate(item.date),
        chamberName(item.house, 'federal') ?? item.house,
        item.question,
        `${formatCount(item.ayes)} ayes · ${formatCount(item.noes)} noes`,
      ]
        .filter(Boolean)
        .join('\n')}
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
                <Text variant="metadata" testID="division-history-count">
                  {formatCount(rows.length)} division records · newest first
                </Text>
                <Text variant="fine" testID="division-history-coverage">
                  {record.loaded} of {record.total} bill files loaded
                  {record.failed ? `; ${record.failed} unavailable` : ''}.{' '}
                  {complete ? '' : 'The chronological list is still loading.'}
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
                <Text wordSafe variant="fine">
                  Only formal divisions are counted; most questions are decided
                  on the voices and leave no per-member record. Division records
                  on federal bills in this static register are listed here. A
                  bill missing from this list is not evidence it does not exist:
                  the register is still being built.
                </Text>
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
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
  },
  header: { paddingBottom: spacing.s4 },
});
