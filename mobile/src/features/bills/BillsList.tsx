import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { ApiError } from '../../api/errors';
import { billFacetsFor, billsFor } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import {
  AsAtLine,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Field,
  FilterChip,
  Group,
  LoadingState,
  OfflineBanner,
  StaleNotice,
  Text,
  errorMessage,
} from '../../design/primitives';
import { chrome, colors, layout, spacing } from '../../design/tokens';
import { billRoute } from '../../navigation/routes';
import {
  appliedFilters,
  billFilterStore,
  countLine,
  useBillFilterState,
  withoutFilter,
} from './filters';
import { BillRow } from './parts';
import { useCatalogRecord } from './useCatalogRecord';

// The web's bill-list fine print, in its words (portal/public/app.js
// BILLS_FINEPRINT), without the sentences about division counts the app's
// list does not show.
const FINEPRINT =
  'Bills, their dates and their divisions come from the parliamentary record; each bill page links the official source it was read from. Summaries are written by a model from the explanatory memorandum or the Bills Digest, are marked as such wherever they appear, and are not the record. A bill missing from this list is not evidence it does not exist: the register is still being built.';

/** The Bills tab: every federal bill in the index, filtered and searched on the device. */
export default function BillsList() {
  const load = useCallback((refresh: boolean) => catalogs.bills(refresh), []);
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const { filters } = useBillFilterState();

  // Filter as the reader types, a beat behind the keyboard.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);

  const index = record?.data;
  const facets = useMemo(() => (index ? billFacetsFor(index) : null), [index]);
  useEffect(() => {
    billFilterStore.setFacets(facets?.data ?? null);
  }, [facets]);
  const list = useMemo(
    () =>
      index ? billsFor(index, { ...filters, query, sort: 'activity' }) : null,
    [index, filters, query],
  );
  const rows = list?.data ?? [];
  const chips = appliedFilters(filters);
  const offline = error instanceof ApiError && error.code === 'offline';

  const header = (
    <Group>
      <Field
        label="Search bills"
        testID="bills-search"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => {
          setQuery(text.trim());
          Keyboard.dismiss();
        }}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      <View style={styles.filters}>
        <Button
          label={chips.length ? `Filters (${chips.length})` : 'Filters'}
          icon="line.3.horizontal.decrease.circle"
          size="compact"
          disabled={!facets}
          onPress={() => {
            Keyboard.dismiss();
            router.push('/bill-filters');
          }}
          testID="bills-filters"
        />
        {chips.map((chip) => (
          <FilterChip
            key={chip.key}
            filter={chip.filter}
            value={chip.value}
            onRemove={() =>
              billFilterStore.setFilters(withoutFilter(filters, chip.key))
            }
            testID={`bills-chip-${chip.key}`}
          />
        ))}
      </View>
      {record?.stale ? (
        <>
          <SavedCopyNotice
            reason={record.staleReason}
            testID={record.staleReason ? 'bills-saved-copy' : 'bills-offline'}
          />
          <StaleNotice
            savedAt={record.savedAt}
            refreshing={refreshing}
            testID="bills-stale"
          />
          <Button
            label="Try again"
            onPress={refresh}
            loading={refreshing}
            testID="bills-refresh"
          />
        </>
      ) : null}
      {record?.partial ? <PartialNotice testID="bills-partial" /> : null}
      {list && index ? (
        <Text variant="metadata" testID="bills-count">
          {countLine(rows.length, index.bills.length)} · latest activity first
        </Text>
      ) : null}
      {offline && !record ? (
        <>
          <OfflineBanner cached={false} testID="bills-offline-uncached" />
          <Button
            label="Try again"
            onPress={retry}
            testID="bills-error-retry"
          />
        </>
      ) : error && !record ? (
        <ErrorState
          message={errorMessage(error)}
          onRetry={retry}
          testID="bills-error"
        />
      ) : !record ? (
        <LoadingState
          shape="rows"
          count={6}
          label="Loading bills"
          testID="bills-loading"
        />
      ) : null}
    </Group>
  );

  const footer = list ? (
    <Group style={styles.footer}>
      <AsAtLine
        asOf={list.asAt}
        citation={list.sources.map((source) => source.label)}
        savedAt={record?.stale ? record.savedAt : null}
        testID="bills-as-at"
      />
      <Text variant="fine">{FINEPRINT}</Text>
    </Group>
  ) : null;

  return (
    <FlatList
      testID="bills-screen"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={chrome.tint}
        />
      }
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      data={list ? rows : []}
      keyExtractor={(bill) => bill.key}
      renderItem={({ item }) => (
        <BillRow bill={item} onPress={() => router.push(billRoute(item.key))} />
      )}
      ItemSeparatorComponent={() => <Divider variant="subtle" />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        list ? (
          <Group>
            <EmptyState
              message="Nothing in the bill list matches that."
              testID="bills-empty"
            />
            {chips.length ? (
              <Button
                label="Clear filters"
                onPress={() => billFilterStore.setFilters({})}
                testID="bills-clear"
              />
            ) : null}
          </Group>
        ) : null
      }
      ListFooterComponent={footer}
      initialNumToRender={12}
    />
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
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
  footer: { paddingTop: spacing.s6 },
});
