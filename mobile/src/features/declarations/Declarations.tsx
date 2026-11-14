import { RouteOptions } from '../../navigation/preview';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { formatCount } from '../../design/format';
import { useRefreshCommand } from '../../design/keyboard';
import {
  ContentUnavailable,
  copy,
  Divider,
  OfflineLine,
  RegionProvider,
  rowMenus,
  SidebarSafe,
  Skeleton,
  SourceLine,
  Text,
  useScreenColumn,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import type { SourceDetails } from '../../design/source';
import { StatePageProvider } from '../../design/states';
import { colors, layout, minimumTarget, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { personRoute } from '../../navigation/routes';
import { filtersRoute } from '../../navigation/routes/filters';
import { presentSource } from '../../navigation/sheets';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { savedCopy } from '../search/present';
import {
  filterStore,
  registerFilterModel,
  useFilterState,
} from '../sheets/filter-model';
import { declarationsFilterModel } from '../sheets/filter-models';
import { FeedGroup } from './FeedRow';
import {
  changesCount,
  feedFacets,
  filterFeed,
  weekRuns,
  type FeedRow,
} from './model';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

const coverageNotes = (rows: number, available: number) => [
  `Showing the newest ${formatCount(rows)} of ${formatCount(available)} dated register changes.`,
  'Entries are as declared, in the member’s own words. OPAX does not verify them. Additions and deletions carry the date the register records.',
  'A name match means an organisation in the entry has the same name in AEC Transparency Register returns, the lobbyist registers or FITS. Matches use exact names, ignoring case and spacing; a shared name is not evidence of wrongdoing. A gift or trip with no match names an organisation those registers do not list under that spelling.',
];
type Run = ReturnType<typeof weekRuns<FeedRow>>[number]['data'][number];
type Week = { key: string; title: string; data: Run[] };

/** The feed's filter store, registered before its first read. */
function useFeedFilters() {
  useState(
    () =>
      filterStore('declarations') ??
      registerFilterModel(declarationsFilterModel()),
  );
  const [state] = useFilterState('declarations');
  const chamber = String(state.chamber || 'all');
  const jurisdiction = String(state.jurisdiction || 'all');
  return useMemo(() => ({ chamber, jurisdiction }), [chamber, jurisdiction]);
}

/**
 * Just declared: every row of /interests/recent.json, newest first, by
 * week, filtered on the device by member (the bar's search field) and, in
 * the filter sheet, by chamber and parliament. Consecutive entries by one
 * member sit under one PersonRow; each entry opens its own source sheet.
 * The source line and the count close the list.
 */
export default function Declarations() {
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      catalogs.declarations(refresh, signal),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const params = useLocalSearchParams<{ person?: string; member?: string }>();
  const arrival = (params.person ?? params.member ?? '').trim();
  const [text, setText] = useState(arrival);
  const [member, setMember] = useState(arrival);
  const filters = useFeedFilters();
  // Filter as the reader types, a beat behind the keyboard.
  useEffect(() => {
    const timer = setTimeout(() => setMember(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);
  const searchBar = useListSearchBar({
    placeholder: 'Member’s name',
    onChangeText: setText,
    onSearchButtonPress: (value) => {
      setText(value);
      setMember(value.trim());
      Keyboard.dismiss();
    },
    onCancelButtonPress: () => {
      setText('');
      setMember('');
    },
  });
  const field = searchBar.ref as { current: SearchBarCommands | null };
  // Today's "See all" and a Today entry arrive with the member's name; the
  // native field shows it once it has mounted.
  const [arrived, setArrived] = useState(arrival);
  if (arrived !== arrival) {
    setArrived(arrival);
    setText(arrival);
    setMember(arrival);
  }
  useEffect(() => {
    if (!arrival) return;
    const fill = () => field.current?.setText(arrival);
    fill();
    const timer = setTimeout(fill, 300);
    return () => clearTimeout(timer);
  }, [arrival, field]);
  const column = useScreenColumn();
  const foot = useFloatingBarFoot(rhythm.section + rhythm.block);
  useRefreshCommand(refresh, refreshing);
  const all = useMemo(() => record?.data ?? [], [record]);
  const facets = useMemo(() => feedFacets(all), [all]);
  useEffect(() => {
    if (record)
      registerFilterModel(
        declarationsFilterModel({
          chambers: facets.chambers.map((f) => ({
            value: f.id,
            label: f.label,
          })),
          jurisdictions: facets.jurisdictions.map((f) => ({
            value: f.id,
            label: f.label,
          })),
        }),
      );
  }, [record, facets]);
  const rows = useMemo(
    () => filterFeed(all, { ...filters, member }),
    [all, filters, member],
  );
  const [today] = useState(() => new Date());
  const sections = useMemo<Week[]>(() => weekRuns(rows, today), [rows, today]);
  const active = [
    filters.chamber !== 'all'
      ? (facets.chambers.find((f) => f.id === filters.chamber)?.label ??
        filters.chamber)
      : null,
    filters.jurisdiction !== 'all'
      ? (facets.jurisdictions.find((f) => f.id === filters.jurisdiction)
          ?.label ?? filters.jurisdiction)
      : null,
  ].filter((label): label is string => !!label);
  const filtered = active.length > 0;
  const count = changesCount(rows.length);
  useEffect(() => {
    if (record) AccessibilityInfo.announceForAccessibility(count);
  }, [count, record]);
  const clear = () => {
    const store = filterStore('declarations');
    store?.set(store.model.initial);
    setText('');
    setMember('');
    field.current?.setText('');
  };
  const saved = record ? savedCopy(record.stale, record.staleReason) : null;
  const source: SourceDetails | null = record
    ? {
        asOf: record.asAt,
        citation: record.meta.source,
        savedAt: record.stale ? record.savedAt : null,
        state: record.partial ? 'partial' : saved!.state,
        notes: [
          ...coverageNotes(record.meta.rows, record.meta.available),
          saved!.note,
          record.partial ? copy.partialNote : null,
        ],
      }
    : null;

  const header =
    saved?.state === 'offline' || (record && (filtered || member)) ? (
      <View style={styles.header}>
        {saved?.state === 'offline' ? (
          <OfflineLine
            savedAt={record!.savedAt}
            testID="declarations-offline"
          />
        ) : null}
        {filtered || member ? (
          <View style={styles.filterLine}>
            <Text
              wordSafe
              variant="footnote"
              tone="inkSoft"
              testID="declarations-filter-line"
              style={styles.grow}
            >
              {[...active, count].join(' · ')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={filtered ? 'Clear filters' : 'Clear search'}
              testID="declarations-filter-clear"
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
          testID="declarations-offline-uncached"
        />
      ) : (
        <ContentUnavailable
          symbol="exclamationmark.triangle"
          title="Couldn’t load declarations"
          body="Check your connection and try again."
          action={{
            label: copy.tryAgain,
            onPress: retry,
            testID: 'declarations-retry',
          }}
          testID="declarations-error"
        />
      )
    ) : (
      <Skeleton
        shape="people"
        count={8}
        label="Loading declarations"
        testID="declarations-loading"
      />
    )
  ) : (
    <View style={styles.empty}>
      <ContentUnavailable
        symbol="magnifyingglass"
        title="No results"
        body={
          member
            ? `No declaration matches “${member}”.`
            : 'No declaration matches these filters.'
        }
        action={
          filtered || member
            ? {
                label: 'Clear filters',
                onPress: clear,
                testID: 'declarations-empty-clear',
              }
            : undefined
        }
        testID="declarations-empty"
      />
    </View>
  );
  const footer =
    source && rows.length ? (
      <View style={styles.foot} testID="declarations-source-foot">
        <SourceLine {...source} testID="declarations-source" />
        <Text
          wordSafe
          variant="footnote"
          tone="inkSoft"
          testID="declarations-total"
        >
          {count}
        </Text>
      </View>
    ) : null;

  return (
    <SidebarSafe style={styles.screen}>
      <RouteOptions
        options={{
          title: 'Just declared',
          headerLargeTitleEnabled: false,
          headerSearchBarOptions: { ...searchBar, obscureBackground: false },
          ...headerItems(
            pageItems({
              name: 'Just declared',
              filters: {
                active: filtered,
                href: filtersRoute('declarations'),
              },
              menu: [
                ...(source
                  ? [
                      {
                        title: copy.sources,
                        symbol: 'doc.text.magnifyingglass' as const,
                        onPress: () =>
                          presentSource(source, {
                            testID: 'declarations-sources',
                          }),
                      },
                    ]
                  : []),
                ...rowMenus.record({
                  title: 'Just declared',
                  path: '/declared',
                }),
              ],
            }),
          ),
        }}
      />
      <StatePageProvider refreshing={refreshing}>
        <SectionList<Run, Week>
          testID="declarations-screen"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.navy}
            />
          }
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content, foot]}
          onLayout={column.onLayout}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          sections={sections}
          keyExtractor={(run) => run.key}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text
                wordSafe
                variant="groupHeader"
                accessibilityRole="header"
                testID={`declarations-week-${section.key}`}
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item: run }) => {
            const slug = run.entries[0]!.item.profileSlug;
            return (
              <FeedGroup
                entries={run.entries}
                onOpenPerson={
                  slug ? () => router.push(personRoute(slug)) : undefined
                }
              />
            );
          }}
          ItemSeparatorComponent={() => <Divider variant="subtle" />}
          ListHeaderComponent={
            <RegionProvider value={column.inner}>
              {column.bar}
              {header}
            </RegionProvider>
          }
          ListEmptyComponent={unavailable}
          ListFooterComponent={footer}
          initialNumToRender={8}
        />
      </StatePageProvider>
    </SidebarSafe>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingBottom: rhythm.section + rhythm.block,
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
  foot: { gap: rhythm.tight, paddingTop: rhythm.block },
});
