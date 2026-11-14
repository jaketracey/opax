import { router } from 'expo-router';
import { RouteOptions } from '../../navigation/preview';
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Platform,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { billFoldText } from '../../api/bill-transforms';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { counted, formatCount, formatDate } from '../../design/format';
import { haptic } from '../../design/haptics';
import { CHAMBER_NOT_RECORDED, chamberName } from '../../design/parliament';
import {
  Button,
  ContentUnavailable,
  DivisionRow,
  InlineError,
  LinkRow,
  OfflineLine,
  SidebarSafe,
  Skeleton,
  SourceLine,
  Text,
  useScreenColumn,
} from '../../design/primitives';
import { rowMenus, useRowFollow } from '../../design/row-link';
import { useListSearchBar } from '../../design/search-bar';
import { StatePageProvider } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Heading } from '../../design/text';
import { colors, layout, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { canonicalUrl, openOnWeb } from '../../navigation/external';
import { trackShare } from '../../navigation/share';
import { billRoute } from '../../navigation/routes';
import { filtersRoute } from '../../navigation/routes/filters';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';
import { countWords, isProcedural, outcomeWord } from '../bills/divisions';
import { useCatalogRecord } from '../bills/useCatalogRecord';
import { copyText } from '../records/actions';
import {
  filterStore,
  registerFilterModel,
  type FilterValues,
} from '../sheets/filter-model';
import { divisionsFilterModel } from '../sheets/filter-models';
import { loadDivisionHistory, type DivisionRecord } from './division-data';
import type { DivisionRow as Division } from './model';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

const PATH = '/bills?view=divisions';
const TITLE = 'Votes in parliament';
const PAGE_SIZE = 16;
const RULE =
  'Every recorded vote on a bill, newest first, grouped by bill. With "Leave out procedural votes" on, procedural motions such as time limits, closure, suspension of standing orders and adjournment are hidden. Votes on a bill’s passage, readings and amendments stay, including those taken under a time limit.';
const NOTE =
  'A vote here is a division: a question decided by counting members. Most questions are decided on the voices, without a recorded vote.';

const votes = (n: number) => `${counted(n, 'vote', 'votes')}`;

/** One bill's run of consecutive votes: the section header and its rows. */
export interface HistorySection {
  key: string;
  billKey: string;
  title: string;
  /** Count the whole run, even when a page ends part way through it. */
  total: number;
  data: Division[];
}

/**
 * Consecutive votes of one bill under one header, so a run of votes is not
 * titled by the same bill four times. Rows stay newest first.
 */
export function historySections(rows: readonly Division[]): HistorySection[] {
  const sections: HistorySection[] = [];
  let run: HistorySection | null = null;
  for (const row of rows) {
    if (!run || run.billKey !== row.billKey) {
      run = {
        key: `bill:${row.key}`,
        billKey: row.billKey,
        title: row.title,
        total: 0,
        data: [],
      };
      sections.push(run);
    }
    run.data.push(row);
    run.total++;
  }
  return sections;
}

/** The divisions filter values this screen applies on the device. */
export interface DivisionFilters {
  chamber?: 'house' | 'senate';
  outcome?: 'agreed' | 'not-agreed';
  procedural?: boolean;
}
export function divisionFilters(state: FilterValues): DivisionFilters {
  return {
    ...(state.chamber === 'house' || state.chamber === 'senate'
      ? { chamber: state.chamber }
      : {}),
    ...(state.outcome === 'agreed' || state.outcome === 'not-agreed'
      ? { outcome: state.outcome }
      : {}),
    ...(state.procedural === true ? { procedural: true } : {}),
  };
}
export const divisionFilterCount = (filters: DivisionFilters) =>
  [filters.chamber, filters.outcome, filters.procedural].filter(Boolean).length;
/**
 * Chamber, outcome and "Leave out procedural votes". A vote with no
 * recorded stage is never hidden as procedural.
 */
export function filterDivisions(
  rows: readonly Division[],
  filters: DivisionFilters,
  query = '',
) {
  const terms = billFoldText(query).split(' ').filter(Boolean);
  return rows.filter((row) => {
    if (filters.chamber) {
      const house = row.house === 'senate' ? 'senate' : 'house';
      if (house !== filters.chamber) return false;
    }
    if (filters.outcome) {
      const agreed = outcomeWord(row.outcome, row) === 'Agreed';
      if (agreed !== (filters.outcome === 'agreed')) return false;
    }
    if (filters.procedural && (row.procedural ?? isProcedural(row.stage)))
      return false;
    if (!terms.length) return true;
    const text = billFoldText(`${row.title} ${row.stage ?? ''}`);
    return terms.every((t) => text.includes(t));
  });
}

const voteTitle = (item: Division) => item.voteTitle ?? item.stage ?? 'Vote';
const divisionWhere = (item: Division) =>
  [
    chamberName(item.house, 'federal') ?? CHAMBER_NOT_RECORDED,
    formatDate(item.date, 'short'),
    item.voteQualifier,
  ]
    .filter(Boolean)
    .join(' · ');

/** How a vote row is spoken: stage, where and when, outcome, counts, bill. */
export function divisionLabel(item: Division) {
  return [
    voteTitle(item),
    divisionWhere(item),
    outcomeWord(item.outcome, item),
    countWords(item.ayes, item.noes, { spoken: true }),
    item.title,
  ].join(', ');
}

/**
 * One vote, titled by its recorded stage, inset under its bill. It opens
 * the bill at this vote, expanded.
 */
const Vote = memo(function Vote({
  item,
  index,
}: {
  item: Division;
  index: number;
}) {
  const division = item.key.split(':').slice(1).join(':');
  const follow = useRowFollow('bill', item.billKey, item.title);
  const inset = useContext(VoteInset);
  return (
    <View style={{ paddingLeft: inset }}>
      <DivisionRow
        title={voteTitle(item)}
        meta={divisionWhere(item)}
        outcome={outcomeWord(item.outcome, item)}
        ayes={item.ayes}
        noes={item.noes}
        countsStyle="ayesNoes"
        href={billRoute(item.billKey, item.title, { division })}
        menu={rowMenus.division({
          billKey: item.billKey,
          billTitle: item.title,
          ...follow,
        })}
        testID={`division-history-${item.billKey}-${index}`}
      />
    </View>
  );
});
/**
 * How far the votes sit in: the bill header's text column, measured, and
 * never more than a third of the column's width. Separators use the same.
 */
export const voteInset = (textColumn: number, width: number) =>
  Math.max(0, Math.min(textColumn, width / 3));
const VoteInset = createContext(0);
const ReportInset = createContext<((inset: number) => void) | null>(null);

/** The bill a run of votes belongs to. */
const BillHeader = memo(function BillHeader({
  section,
}: {
  section: HistorySection;
}) {
  const report = useContext(ReportInset);
  const header = useRef<View>(null);
  const probe = useRef<View>(null);
  const [width, setWidth] = useState(0);
  // The probe sits at the top left of the row's text column, after the
  // symbol's leading column, so its offset is where the title starts.
  const measure = () => {
    const at = probe.current;
    const from = header.current;
    if (!at || !from || !width || !report) return;
    at.measureLayout(from, (x) => report(voteInset(x, width)));
  };
  return (
    <View
      ref={header}
      style={styles.billHeader}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <LinkRow
        title={section.title}
        detail={votes(section.total)}
        symbol={symbols.bills}
        leading={
          // Remounted when the width arrives, so it measures again.
          <View
            ref={probe}
            key={width}
            onLayout={measure}
            pointerEvents="none"
            style={styles.probe}
          />
        }
        accessibilityLabel={`${section.title}, ${votes(section.total)}. Bill.`}
        accessibilityHint="Opens the bill"
        href={billRoute(section.billKey, section.title)}
        testID={`division-history-bill-${section.billKey}`}
      />
    </View>
  );
});

let lists = 0;

/** Votes in parliament: every recorded vote on a bill, grouped by bill. */
export default function DivisionHistory() {
  const load = useCallback(
    (
      refresh: boolean,
      publish: Parameters<typeof loadDivisionHistory>[1],
      signal?: AbortSignal,
    ) => loadDivisionHistory(refresh, publish, signal),
    [],
  );
  const {
    record: latest,
    error,
    refreshing,
    refresh,
    retry,
  } = useCatalogRecord(load);
  const list = useRef<SectionList<Division, HistorySection>>(null);
  const column = useScreenColumn();
  const foot = useFloatingBarFoot();
  const [inset, setInset] = useState(0);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  // Android's search view takes the whole bar while it is open, and
  // react-native-screens hides the bar's other items, Filters among them,
  // from its open to its close. (iOS 26 and later also hide Filters while
  // search is active; an iOS follow-up handles that.)
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);
  const [owner] = useState(() => `history-${++lists}`);
  const [store] = useState(
    () =>
      filterStore('divisions', owner) ??
      registerFilterModel(divisionsFilterModel(), { owner }),
  );
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const filters = divisionFilters(state);
  const filterKey = JSON.stringify(filters);
  const settled = !!latest && latest.loaded + latest.failed === latest.total;
  const usable = settled && (latest.loaded > 0 || latest.total === 0);
  const [page, setPage] = useState({
    record: null as DivisionRecord | null,
    query,
    filters: filterKey,
    limit: PAGE_SIZE,
  });
  // Retain the displayed snapshot through refreshes, including its count and
  // section headers. Only an explicit search/filter change or update action
  // replaces it. Adjust before children render, avoiding an intermediate page.
  if (
    (!page.record && usable) ||
    page.query !== query ||
    page.filters !== filterKey
  ) {
    setPage({
      record: usable ? latest : page.record,
      query,
      filters: filterKey,
      limit: PAGE_SIZE,
    });
  }
  const record = page.record ?? (settled ? latest : null);
  const updatesAvailable = useMemo(
    () =>
      usable &&
      !!record &&
      latest !== record &&
      (JSON.stringify(latest.rows) !== JSON.stringify(record.rows) ||
        latest.stale !== record.stale ||
        latest.failed !== record.failed ||
        latest.partial !== record.partial),
    [usable, latest, record],
  );
  const on = divisionFilterCount(filters);
  const all = useMemo(() => record?.rows ?? [], [record]);
  // The sheet's result line counts what the list would show.
  useEffect(() => {
    registerFilterModel(
      divisionsFilterModel({
        resultCount: (next) =>
          filterDivisions(all, divisionFilters(next)).length,
      }),
      { owner },
    );
  }, [all, owner]);
  const rows = useMemo(
    () => filterDivisions(all, filters, query),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [all, state, query],
  );
  const allSections = useMemo(() => historySections(rows), [rows]);
  const sections = useMemo(() => {
    let remaining = page.limit;
    const visible: HistorySection[] = [];
    for (const section of allSections) {
      if (remaining <= 0) break;
      visible.push(
        section.data.length <= remaining
          ? section
          : { ...section, data: section.data.slice(0, remaining) },
      );
      remaining -= section.data.length;
    }
    return visible;
  }, [allSections, page.limit]);
  const [appending, startAppend] = useTransition();
  const append = () => {
    if (appending || page.limit >= rows.length) return;
    const limit = Math.min(page.limit + PAGE_SIZE, rows.length);
    startAppend(() => {
      setPage((previous) =>
        previous.record === record &&
        previous.query === query &&
        previous.filters === filterKey
          ? { ...previous, limit: Math.max(previous.limit, limit) }
          : previous,
      );
    });
  };
  const complete = !!record && record.loaded + record.failed === record.total;
  const loaded = !!record && (record.loaded > 0 || record.total === 0);
  const offline = error instanceof ApiError && error.code === 'offline';
  useEffect(() => {
    if (complete && !error && loaded)
      AccessibilityInfo.announceForAccessibility(
        `${counted(record.rows.length, 'vote', 'votes')} available`,
      );
  }, [complete, error, loaded, record?.rows.length]);

  const searchBar = useListSearchBar({
    placeholder: 'Bill names',
    onChangeText: setText,
    onSearchButtonPress: (value) => {
      setText(value);
      Keyboard.dismiss();
    },
    onCancelButtonPress: () => setText(''),
  });
  const filterState = {
    accessibilityLabel: on ? `Filters, ${on} on` : 'Filters',
    ...(loaded ? {} : { accessibilityHint: 'Available once votes load' }),
    disabled: !loaded,
    identifier: 'division-history-filters',
  };
  const clear = () => store.set(store.model.reset(store.get()));
  const filtersHref = filtersRoute('divisions', owner);
  // So on Android, an open search pins Filters under the search field,
  // where scrolling the results can't take it: search and filter combine.
  const filtersUnderSearch =
    Platform.OS === 'android' && (searchOpen || !!text);

  const searching = !!query;
  const countText = searching
    ? votes(rows.length)
    : on
      ? `${formatCount(rows.length)} of ${votes(all.length)}`
      : votes(all.length);
  const source = record ? (
    <SourceLine
      asOf={record.asAt}
      citation="They Vote For You"
      licence="ODbL"
      licenceDataset="tvfy"
      savedAt={record.stale ? record.savedAt : null}
      state={record.partial ? 'partial' : null}
      originals={[
        {
          label: 'They Vote For You',
          url: 'https://theyvoteforyou.org.au/divisions',
          record: 'divisions',
        },
      ]}
      rule={RULE}
      notes={[NOTE, record.partial ? 'Some records could not be read.' : null]}
      testID="division-history-source"
    />
  ) : null;

  const titleRef = useRef<View>(null);
  const scrollTitle = useTitleOnScroll(titleRef, TITLE);
  const header = (
    <View style={styles.header}>
      <View
        ref={titleRef}
        collapsable={false}
        onLayout={scrollTitle.onTitleLayout}
      >
        <Heading level={1} kind="page">
          {TITLE}
        </Heading>
      </View>
      {record?.stale && !record.failed ? (
        <OfflineLine
          savedAt={record.savedAt}
          testID="division-history-offline"
        />
      ) : null}
      {loaded ? (
        <View style={styles.count}>
          <Text variant="secondary" tabular testID="division-history-count">
            {countText}
          </Text>
          {on && rows.length ? (
            <Button
              label="Clear filters"
              variant="plain"
              onPress={clear}
              testID="division-history-clear"
            />
          ) : null}
        </View>
      ) : null}
      {record?.failed && record.loaded ? (
        <InlineError
          subject="some votes"
          message={`Votes from ${formatCount(record.loaded)} of ${counted(record.total, 'bill', 'bills')}. ${formatCount(record.failed)} couldn’t be loaded.`}
          onRetry={refresh}
          testID="division-history-partial"
        />
      ) : null}
    </View>
  );
  const empty =
    offline && !record ? (
      <ContentUnavailable
        symbol="wifi.slash"
        title={copy.notSaved}
        body={copy.notSavedBody}
        testID="division-history-offline-uncached"
      />
    ) : (error && !record) ||
      (record && record.total > 0 && record.failed === record.total) ? (
      <ContentUnavailable
        symbol="exclamationmark.triangle"
        title="Votes couldn’t be loaded"
        action={{
          label: copy.tryAgain,
          onPress: error && !record ? retry : refresh,
          testID: 'division-history-error-retry',
        }}
        testID="division-history-error"
      />
    ) : !loaded ? (
      <Skeleton
        shape="rows"
        count={6}
        label="Loading votes"
        testID="division-history-loading"
      />
    ) : searching ? (
      <ContentUnavailable
        symbol="magnifyingglass"
        title={`No results for "${query}"`}
        announcement="No results"
        body="Check the spelling or try a new search."
        testID="division-history-empty"
      />
    ) : on ? (
      <ContentUnavailable
        symbol="line.3.horizontal.decrease.circle"
        title="No votes match these filters"
        action={{
          label: 'Clear filters',
          onPress: clear,
          testID: 'division-history-empty-clear',
        }}
        testID="division-history-empty"
      />
    ) : (
      <ContentUnavailable
        symbol="hand.raised"
        title="No votes recorded yet"
        testID="division-history-empty"
      />
    );
  return (
    <>
      <RouteOptions
        options={{
          title: TITLE,
          headerTitleAlign: 'center',
          headerLargeTitleEnabled: false,
          headerSearchBarOptions: {
            ...searchBar,
            hideWhenScrolling: true,
            ...(Platform.OS === 'android'
              ? {
                  onOpen: () => setSearchOpen(true),
                  onClose: () => setSearchOpen(false),
                }
              : {}),
          },
          ...headerItems(() =>
            pageItems({
              name: TITLE,
              filters: { active: on > 0, href: filtersHref },
              menu: [
                {
                  title: 'Copy link',
                  symbol: 'link',
                  onPress: () => {
                    void copyText(canonicalUrl(PATH)).then((copied) => {
                      if (!copied) return;
                      haptic('success');
                      trackShare('copy_link', PATH);
                    });
                  },
                },
                {
                  title: 'Open on opax.com.au',
                  symbol: 'arrow.up.right.square',
                  onPress: () => void openOnWeb(PATH, TITLE),
                },
              ],
            })().map((item) =>
              item.type === 'button' && item.label === 'Filters'
                ? { ...item, ...filterState }
                : item,
            ),
          ),
        }}
      />
      {/* The iPad sidebar floats over a bare list; this keeps rows clear of
          it, and on regular width the rows keep the readable column. */}
      <SidebarSafe style={styles.screen}>
        {filtersUnderSearch ? (
          <View style={styles.searchFilters}>
            <Button
              label="Filters"
              variant="outlined"
              symbol={
                on
                  ? 'line.3.horizontal.decrease.circle.fill'
                  : 'line.3.horizontal.decrease.circle'
              }
              accessibilityLabel={filterState.accessibilityLabel}
              accessibilityHint={filterState.accessibilityHint}
              disabled={filterState.disabled}
              onPress={() => router.push(filtersHref)}
              testID="division-history-search-filters"
            />
          </View>
        ) : null}
        <ReportInset.Provider value={setInset}>
          <VoteInset.Provider value={inset}>
            <StatePageProvider refreshing={refreshing}>
              <SectionList
                ref={list}
                onScroll={scrollTitle.onScroll}
                scrollEventThrottle={16}
                testID="division-history-screen"
                style={styles.screen}
                contentContainerStyle={[styles.content, column.content, foot]}
                onLayout={column.onLayout}
                contentInsetAdjustmentBehavior="automatic"
                keyboardDismissMode="on-drag"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={refresh}
                    tintColor={colors.navy}
                  />
                }
                sections={loaded ? sections : []}
                onEndReached={append}
                onEndReachedThreshold={0.5}
                stickySectionHeadersEnabled={false}
                keyExtractor={(item) => item.key}
                renderSectionHeader={({ section }) => (
                  <BillHeader section={section as HistorySection} />
                )}
                renderItem={({ item, index }) => (
                  <Vote item={item} index={index} />
                )}
                ItemSeparatorComponent={Separator}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={7}
                removeClippedSubviews={false}
                ListHeaderComponent={header}
                ListEmptyComponent={empty}
                ListFooterComponent={
                  <View style={styles.footer}>
                    {appending ? (
                      <ActivityIndicator
                        color={colors.inkSoft}
                        accessibilityLabel="Loading more votes"
                        testID="division-history-more-loading"
                      />
                    ) : null}
                    {updatesAvailable ? (
                      <Button
                        label="Show updated votes"
                        variant="plain"
                        onPress={() => {
                          if (sections.length)
                            list.current?.scrollToLocation({
                              sectionIndex: 0,
                              itemIndex: 0,
                              animated: false,
                            });
                          setPage({
                            record: latest,
                            query,
                            filters: filterKey,
                            limit: PAGE_SIZE,
                          });
                        }}
                        testID="division-history-updates"
                      />
                    ) : null}
                    {loaded ? source : null}
                  </View>
                }
              />
            </StatePageProvider>
          </VoteInset.Provider>
        </ReportInset.Provider>
      </SidebarSafe>
    </>
  );
}
function Separator() {
  const inset = useContext(VoteInset);
  return <View style={[styles.separator, { marginLeft: inset }]} />;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  searchFilters: {
    flexDirection: 'row',
    paddingHorizontal: layout.screenMargin,
    paddingVertical: rhythm.tight,
    backgroundColor: colors.paper,
  },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
  },
  header: { gap: rhythm.tight },
  count: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rhythm.tight,
  },
  billHeader: { marginTop: rhythm.section, marginBottom: rhythm.tight },
  probe: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.dividerSubtle,
  },
  footer: { paddingTop: rhythm.heading, gap: rhythm.block },
});
