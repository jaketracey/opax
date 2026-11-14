import { MyMemberProvider } from '../your-mp/useIsMyMember';
import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
  type SectionListData,
  type SectionListRenderItemInfo,
  type ViewToken,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import type { Electorate } from '../../api/catalog-decoders';
import { ApiError } from '../../api/errors';
import {
  Button,
  ContentUnavailable,
  EmptyState,
  LayoutRegion,
  OfflineLine,
  SidebarSafe,
  Skeleton,
  SourceLine,
  SplitLayout,
  Text,
  copy,
  useAdaptiveDevice,
  rowMenus,
  useLayout,
  type SFSymbol,
} from '../../design/primitives';
import { useSplitSeparator } from '../../design/selection';
import { useListSearchBar } from '../../design/search-bar';
import type { SourceDetails } from '../../design/source';
import { StatePageProvider } from '../../design/states';
import { colors, layout, minimumTarget, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { filtersRoute } from '../../navigation/routes/filters';
import { resultsRoute } from '../../navigation/routes/search';
import { presentSource } from '../../navigation/sheets';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { savedCopy } from '../search/present';
import {
  filterStore,
  registerFilterModel,
  useFilterState,
} from '../sheets/filter-model';
import { directoryFilterModel } from '../sheets/filter-models';
import {
  decodeEntry,
  encodeEntry,
  entryLabel,
  entryFromRoute,
  entryRoute,
  hasPaneActions,
  useSplitSelectionParams,
  type RecordEntry,
} from '../split/entry';
import { RecordDetail, RecordShare } from '../split/RecordDetail';
import { loadDirectory, type DirectoryRecord } from './data';
import {
  ElectorateDirectoryRow,
  PartyDirectoryRow,
  PersonDirectoryRow,
  entryFor,
} from './DirectoryRows';
import {
  directoryCount,
  directoryKind,
  electorateSections,
  matchingElectorates,
  matchingParties,
  matchingPeople,
  partyName,
  peopleSections,
  type DirectoryKind,
  type DirectorySection,
  type Filters,
  type PartyRow,
  type PeopleRow,
} from './model';
import { directoryNotes } from './notes';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

const titles: Record<DirectoryKind, string> = {
  person: 'Parliamentarians',
  party: 'Parties',
  electorate: 'Electorates',
};
const placeholders: Record<DirectoryKind, string> = {
  person: 'Name, electorate or state',
  party: 'Party name',
  electorate: 'Electorate, member or state',
};
// "No parliamentarian matches …", "Choose a party".
const singular: Record<DirectoryKind, string> = {
  person: 'parliamentarian',
  party: 'party',
  electorate: 'electorate',
};
// The empty detail pane's symbol: the one Search's Browse rows use.
const paneSymbols: Record<DirectoryKind, SFSymbol> = {
  person: 'person.crop.circle',
  party: 'person.3',
  electorate: 'map',
};
type Row = PeopleRow | PartyRow | Electorate;
type Section = DirectorySection<Row>;
const rowKey = (item: Row) => ('key' in item ? item.key : item.electorate_id);

function DirectoryRow({
  item,
  selected,
  onSelect,
}: {
  item: Row;
  selected?: boolean;
  onSelect?: (entry: RecordEntry) => void;
}) {
  if ('profile' in item)
    return (
      <PersonDirectoryRow item={item} selected={selected} onSelect={onSelect} />
    );
  if ('money' in item)
    return (
      <PartyDirectoryRow item={item} selected={selected} onSelect={onSelect} />
    );
  return (
    <ElectorateDirectoryRow
      item={item}
      selected={selected}
      onSelect={onSelect}
    />
  );
}
function SectionTitle({ section }: { section: SectionListData<Row, Section> }) {
  return section.title ? (
    <View style={styles.sectionHeader}>
      <Text
        wordSafe
        variant="groupHeader"
        accessibilityRole="header"
        testID={`directory-group-${section.key}`}
      >
        {section.title}
      </Text>
    </View>
  ) : null;
}

/** The directory's one source sheet: the foot line and ⋯ › Sources. */
function sourceDetails(
  kind: DirectoryKind,
  record: DirectoryRecord,
): SourceDetails {
  const saved = savedCopy(record.stale, record.staleReason);
  return {
    citation: record.sources.map((s) => ({ label: s.label, asOf: s.asAt })),
    savedAt: record.stale ? record.savedAt : null,
    state: record.partial ? 'partial' : saved.state,
    notes: [
      ...directoryNotes[kind],
      saved.note,
      record.partial ? copy.partialNote : null,
    ],
  };
}

/** The filter store for this kind, registered before its first read. */
function useDirectoryFilters(kind: DirectoryKind) {
  useState(
    () =>
      filterStore('directory', kind) ??
      registerFilterModel(directoryFilterModel({ kind }), { owner: kind }),
  );
  return useFilterState('directory', kind)[0] as Filters;
}
/** The rows and switches that are on, in words: "Labor · Senate". */
function activeFilters(kind: DirectoryKind, filters: Filters): string[] {
  const model = filterStore('directory', kind)?.model;
  if (!model) return [];
  return [
    ...model.rows
      .filter((row) => row.key !== 'sort' && row.value(filters))
      .map((row) => {
        const value = row.value(filters);
        return (
          row.choices(filters).find((c) => c.value === value)?.label ?? value
        );
      }),
    ...(model.toggles ?? [])
      .filter((toggle) => toggle.value(filters))
      .map((toggle) => toggle.label),
  ];
}

function DirectoryContent() {
  const adaptive = useAdaptiveDevice();
  const params = useLocalSearchParams<{ kind: string }>();
  const kind = directoryKind(params.kind);
  // A directory deep link can replace kind on this same route. Keep each view’s
  // query and record local, so the previous kind never filters or flashes here.
  if (!adaptive) return <DirectoryView key={kind} kind={kind} />;
  // iPad: the region a split measures (list left, profile right).
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <DirectoryView key={kind} kind={kind} />
      </LayoutRegion>
    </SidebarSafe>
  );
}
function DirectoryView({ kind }: { kind: DirectoryKind }) {
  const adaptive = useAdaptiveDevice();
  const foot = useFloatingBarFoot();
  const setSelectionParams = useSplitSelectionParams();
  const title = titles[kind];
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      loadDirectory(kind, refresh, signal),
    [kind],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const filters = useDirectoryFilters(kind);
  const params = useLocalSearchParams<{
    open?: string;
    party?: string;
    sitting?: string;
  }>();
  // The party page's Members row and a row's "Open party" arrive filtered.
  useEffect(() => {
    if (params.party === undefined && params.sitting === undefined) return;
    const store = filterStore('directory', kind);
    if (!store) return;
    store.set({
      ...store.model.initial,
      sort: store.get().sort,
      ...(params.party ? { party: partyName(params.party) } : {}),
      ...(params.sitting === '1' ? { sitting: '1' } : {}),
    });
  }, [kind, params.party, params.sitting]);
  useEffect(() => {
    if (record)
      registerFilterModel(
        directoryFilterModel({ kind, facets: record.facets }),
        { owner: kind },
      );
  }, [kind, record]);

  const [text, setText] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);
  const searchBar = useListSearchBar({
    placeholder: placeholders[kind],
    onChangeText: setText,
    onSearchButtonPress: (value) => {
      setText(value);
      setQuery(value.trim());
      Keyboard.dismiss();
    },
    onCancelButtonPress: () => {
      setText('');
      setQuery('');
    },
  });

  const rows = useMemo<Row[]>(
    () =>
      !record
        ? []
        : kind === 'person'
          ? matchingPeople(record.people, filters, query)
          : kind === 'party'
            ? matchingParties(record.parties, filters, query)
            : matchingElectorates(record.electorates, filters, query),
    [kind, record, filters, query],
  );
  const sections = useMemo<Section[]>(
    () =>
      kind === 'person'
        ? (peopleSections(rows as PeopleRow[]) as Section[])
        : kind === 'electorate'
          ? (electorateSections(
              rows as Electorate[],
              String(filters.sort ?? ''),
            ) as Section[])
          : rows.length
            ? [{ key: 'all', title: null, data: rows }]
            : [],
    [kind, rows, filters.sort],
  );
  const active = activeFilters(kind, filters);
  const filtered = active.length > 0;
  const count = directoryCount(kind, rows.length);
  useEffect(() => {
    if (record) AccessibilityInfo.announceForAccessibility(count);
  }, [count, record]);
  const clear = () => {
    const store = filterStore('directory', kind);
    store?.set({ ...store.model.initial, sort: filters.sort });
    setText('');
    setQuery('');
    (searchBar.ref as { current: SearchBarCommands | null }).current?.setText(
      '',
    );
  };
  const source = record ? sourceDetails(kind, record) : null;

  // iPad regular width: list left, the record right, the selection in the
  // route (`/directory?kind=person&open=person:…`), as Bills does.
  const split = useLayout().split;
  const selected = decodeEntry(params.open);
  const selectedKey = selected ? encodeEntry(selected) : null;
  const listed = useMemo(
    () => sections.flatMap((section) => section.data),
    [sections],
  );
  const separator = useSplitSeparator(
    listed,
    split && selectedKey
      ? (row) => encodeEntry(entryFor(row)) === selectedKey
      : null,
  );
  const listRef = useRef<SectionList<Row, Section>>(null);
  const visible = useRef(new Set<string>());
  // SectionList needs one stable callback for its whole life.
  const [onViewable] = useState(
    () =>
      ({ viewableItems }: { viewableItems: ViewToken[] }) => {
        visible.current = new Set(
          viewableItems.map((item) => String(item.key)),
        );
      },
  );
  const select = useCallback(
    (entry: RecordEntry | null) => {
      Keyboard.dismiss();
      setSelectionParams({ open: entry ? encodeEntry(entry) : '' });
      if (!entry) return;
      // A keyboard step past the visible rows brings the row into view.
      const key = encodeEntry(entry);
      sections.some((section, sectionIndex) => {
        const itemIndex = section.data.findIndex(
          (row) => encodeEntry(entryFor(row)) === key,
        );
        if (itemIndex < 0) return false;
        if (!visible.current.has(rowKey(section.data[itemIndex]!)))
          listRef.current?.scrollToLocation({
            sectionIndex,
            itemIndex,
            viewPosition: 0.5,
            animated: true,
          });
        return true;
      });
    },
    [sections, setSelectionParams],
  );
  const renderRow = useCallback(
    ({ item }: SectionListRenderItemInfo<Row, Section>) => (
      <DirectoryRow item={item} />
    ),
    [],
  );
  const renderSplitRow = useCallback(
    ({ item }: SectionListRenderItemInfo<Row, Section>) => (
      <DirectoryRow
        item={item}
        selected={encodeEntry(entryFor(item)) === selectedKey}
        onSelect={select}
      />
    ),
    [selectedKey, select],
  );
  const entries = useMemo(
    () =>
      new Map(rows.map((row) => [encodeEntry(entryFor(row)), entryFor(row)])),
    [rows],
  );
  // A cleared selection (`open=`) stays cleared. SplitLayout chooses the
  // default only while focused, after recovering any compact detail route.
  const first = rows[0];

  const offline = record ? savedCopy(record.stale, record.staleReason) : null;
  const statusHeader =
    offline?.state === 'offline' || (record && (filtered || query)) ? (
      <View style={styles.header}>
        {offline?.state === 'offline' ? (
          <OfflineLine savedAt={record!.savedAt} />
        ) : null}
        {filtered || query ? (
          <View style={styles.filterLine}>
            <Text
              wordSafe
              variant="footnote"
              tone="inkSoft"
              testID="directory-filter-line"
              style={styles.grow}
            >
              {[...active, count].join(' · ')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={filtered ? 'Clear filters' : 'Clear search'}
              testID="directory-filter-clear"
              onPress={clear}
              style={styles.clear}
            >
              <Text wordSafe variant="footnote" tone="navy">
                Clear
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ) : null;
  const unavailable = !record ? (
    error ? (
      error instanceof ApiError && error.code === 'offline' ? (
        <ContentUnavailable
          symbol="wifi.slash"
          title={copy.notSaved}
          body={copy.notSavedBody}
          testID="directory-offline"
        />
      ) : (
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title={`Couldn’t load ${title.toLowerCase()}`}
          body={
            error instanceof ApiError && error.code === 'invalid-data'
              ? error.message
              : 'Check your connection and try again.'
          }
          action={{
            label: copy.tryAgain,
            onPress: retry,
            testID: 'directory-retry',
          }}
          testID="directory-error"
        />
      )
    ) : (
      <Skeleton
        shape={kind === 'person' ? 'people' : 'rows'}
        count={8}
        label={`Loading ${title.toLowerCase()}`}
        testID="directory-loading"
      />
    )
  ) : (
    <View style={styles.empty}>
      <ContentUnavailable
        symbol="magnifyingglass"
        title="No results"
        body={
          query
            ? `No ${singular[kind]} matches “${query}”.`
            : `No ${singular[kind]} matches these filters.`
        }
        action={
          filtered
            ? {
                label: 'Clear filters',
                onPress: clear,
                testID: 'directory-empty-clear',
              }
            : undefined
        }
        testID="directory-empty"
      />
      {query ? (
        <Button
          label={`Search OPAX for “${query}”`}
          variant="plain"
          testID="directory-search-all"
          onPress={() => router.push(resultsRoute('all', { q: query }))}
        />
      ) : null}
    </View>
  );
  const footer =
    record && source && rows.length ? (
      <View style={styles.footer}>
        {kind === 'electorate' &&
        (rows as Electorate[]).some(
          (seat) =>
            seat.status !== 'historical' &&
            (seat.representation_status !== 'verified' ||
              !seat.representatives.length),
        ) ? (
          <Text variant="footnote" tone="inkSoft">
            Member not confirmed for some electorates.
          </Text>
        ) : null}
        <SourceLine {...source} testID="directory-source" />
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID="directory-count"
        >
          {count}
        </Text>
      </View>
    ) : null;
  const path = `/subject/${kind}`;
  const list = (
    <StatePageProvider refreshing={refreshing}>
      <SectionList<Row, Section>
        ref={listRef}
        testID={`directory-${kind}-screen`}
        style={styles.screen}
        contentContainerStyle={[styles.content, foot]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        sections={sections}
        keyExtractor={rowKey}
        renderItem={split ? renderSplitRow : renderRow}
        renderSectionHeader={({ section }) => (
          <SectionTitle section={section} />
        )}
        stickySectionHeadersEnabled
        extraData={split ? selectedKey : undefined}
        onViewableItemsChanged={adaptive ? onViewable : undefined}
        // A row not yet measured: scroll near it; the next step lands on it.
        onScrollToIndexFailed={({ index: at, averageItemLength }) =>
          listRef.current
            ?.getScrollResponder()
            ?.scrollTo({ y: averageItemLength * at, animated: true })
        }
        ItemSeparatorComponent={separator}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={false}
        ListHeaderComponent={statusHeader}
        ListEmptyComponent={unavailable}
        ListFooterComponent={footer}
      />
    </StatePageProvider>
  );
  return (
    <>
      <RouteOptions
        options={{
          title,
          headerTitle: kind === 'person' ? 'People' : title,
          headerLargeTitleEnabled: false,
          headerSearchBarOptions: { ...searchBar, obscureBackground: false },
          ...headerItems(
            pageItems({
              name: title,
              filters: {
                active: filtered,
                href: filtersRoute('directory', kind),
              },
              menu: [
                ...(source
                  ? [
                      {
                        title: copy.sources,
                        symbol: 'doc.text.magnifyingglass' as const,
                        onPress: () =>
                          presentSource(source, {
                            testID: 'directory-sources',
                          }),
                      },
                    ]
                  : []),
                ...rowMenus.record({ title, path }),
              ],
            }),
          ),
        }}
      />
      {adaptive ? (
        <SplitLayout<RecordEntry>
          id="directory"
          testID="directory-split"
          list={list}
          selected={selected}
          initialSelection={() =>
            params.open === undefined && first ? entryFor(first) : null
          }
          onSelect={select}
          entryKey={encodeEntry}
          entryRoute={entryRoute}
          entryFromRoute={entryFromRoute}
          entryTitle={entryLabel}
          renderDetail={(entry) => <RecordDetail entry={entry} />}
          detailActions={(entry) =>
            hasPaneActions(entry) ? <RecordShare entry={entry} /> : null
          }
          keys={[...entries.keys()]}
          entryForKey={(key) => entries.get(key)!}
          empty={
            <EmptyState
              size="pane"
              icon={paneSymbols[kind]}
              title={`Choose ${kind === 'electorate' ? 'an' : 'a'} ${singular[kind]}`}
              testID="directory-split-empty"
            />
          }
        />
      ) : (
        list
      )}
    </>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: rhythm.section,
  },
  header: { paddingTop: rhythm.tight, gap: rhythm.tight },
  filterLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: rhythm.tight,
  },
  grow: { flexGrow: 1, flexShrink: 1 },
  clear: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    backgroundColor: colors.paper,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.tight,
  },
  empty: { gap: rhythm.block, paddingTop: rhythm.block },
  footer: { gap: rhythm.tight, paddingTop: rhythm.block },
});

export default function DirectoryScreen() {
  return (
    <MyMemberProvider>
      <DirectoryContent />
    </MyMemberProvider>
  );
}
