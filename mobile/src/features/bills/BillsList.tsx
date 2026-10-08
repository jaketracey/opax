import { PartialNotice, SavedCopyNotice } from '../CatalogNotice';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  RefreshControl,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
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
  IconButton,
  InfoButton,
  LayoutRegion,
  SidebarSafe,
  LinkRow,
  LoadingState,
  OfflineBanner,
  SplitEmpty,
  SplitLayout,
  StaleNotice,
  Text,
  errorMessage,
  isPad,
  useLayout,
} from '../../design/primitives';
import { shareRecord } from '../../navigation/share';
import BillTextReader from '../records/BillTextReader';
import BillDetail from './BillDetail';
import type { BillEntry } from './navigation';
import { chrome, colors, layout, spacing } from '../../design/tokens';
import { billRoute } from '../../navigation/routes';
import {
  appliedFilters,
  billSorts,
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

/**
 * The Bills tab: every federal bill in the index, filtered and searched on
 * the device. On iPad regular width it is the reference split view: this
 * list on the left, the selected bill (and its text) in the detail pane.
 */
export default function BillsList() {
  // The region a split measures; iPhone keeps the bare list (no wrapper).
  if (!isPad) return <BillsScreen />;
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <BillsScreen />
      </LayoutRegion>
    </SidebarSafe>
  );
}

function BillsScreen() {
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
      index
        ? billsFor(index, { ...filters, query, sort: filters.sort ?? 'newest' })
        : null,
    [index, filters, query],
  );
  const rows = useMemo(() => list?.data ?? [], [list]);
  const chips = appliedFilters(filters);

  // iPad regular width: the selection lives in the route (`/bills?bill=…`),
  // so it survives tab switches and a deep link can open a bill in the pane.
  const layout = useLayout();
  const split = layout.regular;
  const params = useLocalSearchParams<{ bill?: string }>();
  const selectedKey = params.bill || null;
  const titleFor = useCallback(
    (key: string) => index?.bills.find((bill) => bill.key === key)?.title,
    [index],
  );
  const selected = useMemo<BillEntry | null>(
    () =>
      selectedKey
        ? { kind: 'bill', key: selectedKey, title: titleFor(selectedKey) }
        : null,
    [selectedKey, titleFor],
  );
  const listRef = useRef<FlatList<(typeof rows)[number]>>(null);
  const visible = useRef(new Set<string>());
  // FlatList needs one stable callback for its whole life.
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        visible.current = new Set(
          viewableItems.map((item) => String(item.key)),
        );
      },
  );
  const select = useCallback(
    (entry: BillEntry | null) => {
      // Choosing a result puts the search keyboard away, as Mail does.
      Keyboard.dismiss();
      router.setParams({ bill: entry?.key ?? '' });
      // A keyboard step past the visible rows brings the row into view.
      const at = entry ? rows.findIndex((bill) => bill.key === entry.key) : -1;
      if (at >= 0 && !visible.current.has(entry!.key))
        listRef.current?.scrollToIndex({
          index: at,
          viewPosition: 0.5,
          animated: true,
        });
    },
    [rows],
  );
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
        <View style={styles.count}>
          <Text variant="metadata" testID="bills-count" style={styles.grow}>
            {countLine(rows.length, index.bills.length)} ·{' '}
            {billSorts
              .find((s) => s.value === (filters.sort ?? 'newest'))
              ?.label.toLowerCase()}
          </Text>
          <InfoButton
            title="About the bill list"
            notes={[FINEPRINT]}
            testID="bills-info"
          />
        </View>
      ) : null}
      <LinkRow
        title="Division history"
        icon="checkmark.seal"
        accent="votes"
        testID="bills-division-history"
        onPress={() => router.push('/division-history')}
      />
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
    </Group>
  ) : null;

  const listView = (
    <FlatList
      ref={listRef}
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
      renderItem={({ item }) =>
        split ? (
          <BillRow
            bill={item}
            selected={item.key === selectedKey}
            onPress={() =>
              select({ kind: 'bill', key: item.key, title: item.title })
            }
          />
        ) : (
          <BillRow
            bill={item}
            onPress={() => router.push(billRoute(item.key))}
          />
        )
      }
      extraData={split ? selectedKey : undefined}
      onViewableItemsChanged={split ? onViewable : undefined}
      onScrollToIndexFailed={({ index: at, averageItemLength }) =>
        listRef.current?.scrollToOffset({
          offset: averageItemLength * at,
          animated: true,
        })
      }
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
  if (!isPad) return listView;
  return (
    <>
      {/* The list column keeps an inline title; large titles over two
          panes would collapse with whichever scrolls first. */}
      <Stack.Screen options={{ headerLargeTitleEnabled: !split }} />
      <SplitLayout<BillEntry>
        id="bills"
        testID="bills-split"
        list={listView}
        selected={selected}
        onSelect={select}
        entryKey={(entry) => `${entry.kind}:${entry.key}`}
        entryTitle={(entry) => (entry.kind === 'bill' ? 'Bill' : 'Bill text')}
        renderDetail={(entry) =>
          entry.kind === 'bill' ? (
            <BillDetail recordKey={entry.key} embedded />
          ) : (
            <BillTextReader recordKey={entry.key} embedded />
          )
        }
        detailActions={(entry) => (
          <IconButton
            symbol="square.and.arrow.up"
            accessibilityLabel="Share"
            testID="bill-pane-share"
            onPress={() =>
              void shareRecord({
                path: `/bill/${entry.key}`,
                title: entry.title ?? titleFor(entry.key) ?? 'Bill',
              })
            }
          />
        )}
        keys={rows.map((bill) => bill.key)}
        entryForKey={(key) => ({ kind: 'bill', key, title: titleFor(key) })}
        empty={
          <SplitEmpty
            icon="doc.text"
            accent="bills"
            title="No bill selected"
            message={
              list && index
                ? countLine(rows.length, index.bills.length)
                : undefined
            }
            testID="bills-split-empty"
          />
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
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.s3,
  },
  footer: { paddingTop: spacing.s4 },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  grow: { flex: 1 },
});
