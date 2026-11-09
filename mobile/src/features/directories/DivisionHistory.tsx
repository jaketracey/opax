import { Stack, type NativeStackHeaderItem } from 'expo-router';
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
} from 'react';
import {
  AccessibilityInfo,
  Keyboard,
  RefreshControl,
  SectionList,
  StyleSheet,
  View,
} from 'react-native';
import { billFoldText } from '../../api/bill-transforms';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { formatCount, formatDate } from '../../design/format';
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
import { filtersItem, headerItems, pageMenu } from '../../navigation/chrome';
import { canonicalUrl, openOnWeb } from '../../navigation/external';
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
import { loadDivisionHistory } from './division-data';
import type { DivisionRow as Division } from './model';

const PATH = '/bills?view=divisions';
const TITLE = 'Votes in parliament';
const RULE =
  'Every recorded vote on a bill, newest first, grouped by bill. With "Leave out procedural votes" on, votes recorded as limitation of debate, closure, suspension of standing orders or adjournment are hidden.';
const NOTE =
  'A vote here is a division: a question decided by counting members. Most questions are decided on the voices, without a recorded vote.';

const votes = (n: number) => `${formatCount(n)} ${n === 1 ? 'vote' : 'votes'}`;

/** One bill's run of consecutive votes: the section header and its rows. */
export interface HistorySection {
  key: string;
  billKey: string;
  title: string;
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
        data: [],
      };
      sections.push(run);
    }
    run.data.push(row);
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
      const agreed = outcomeWord(row.outcome, row) === 'Agreed to';
      if (agreed !== (filters.outcome === 'agreed')) return false;
    }
    if (filters.procedural && isProcedural(row.stage)) return false;
    if (!terms.length) return true;
    const text = billFoldText(`${row.title} ${row.stage ?? ''}`);
    return terms.every((t) => text.includes(t));
  });
}

const divisionWhere = (item: Division) =>
  [
    chamberName(item.house, 'federal') ?? CHAMBER_NOT_RECORDED,
    formatDate(item.date, 'short'),
  ].join(' · ');

/** How a vote row is spoken: stage, where and when, outcome, counts, bill. */
export function divisionLabel(item: Division) {
  return [
    item.stage ?? 'Vote',
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
        title={item.stage ?? 'Vote'}
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
        detail={votes(section.data.length)}
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
        accessibilityLabel={`${section.title}, ${votes(section.data.length)}. Bill.`}
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
    (refresh: boolean, publish: Parameters<typeof loadDivisionHistory>[1]) =>
      loadDivisionHistory(refresh, publish),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  const column = useScreenColumn();
  const [inset, setInset] = useState(0);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
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
  const sections = useMemo(() => historySections(rows), [rows]);
  const complete = !!record && record.loaded + record.failed === record.total;
  const loaded = !!record && (record.loaded > 0 || record.total === 0);
  const offline = error instanceof ApiError && error.code === 'offline';
  useEffect(() => {
    if (complete && !error && loaded)
      AccessibilityInfo.announceForAccessibility(
        `${formatCount(record.rows.length)} votes shown`,
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
  const filtersButton: NativeStackHeaderItem = {
    ...(filtersItem({
      active: on > 0,
      href: filtersRoute('divisions', owner),
    }) as Extract<NativeStackHeaderItem, { type: 'button' }>),
    accessibilityLabel: on ? `Filters, ${on} on` : 'Filters',
    ...(loaded ? {} : { accessibilityHint: 'Available once votes load' }),
    disabled: !loaded,
    identifier: 'division-history-filters',
  };
  const clear = () => store.set(store.model.reset(store.get()));

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
  const scrollTitle = useTitleOnScroll(titleRef, TITLE, { trailing: 2 });
  const header = (
    <View style={styles.header}>
      <View ref={titleRef} onLayout={scrollTitle.onTitleLayout}>
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
          message={`Votes from ${formatCount(record.loaded)} of ${formatCount(record.total)} bills. ${formatCount(record.failed)} couldn't be loaded.`}
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
        title="Votes couldn't be loaded"
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
      <Stack.Screen
        options={{
          title: TITLE,
          headerLargeTitleEnabled: false,
          headerSearchBarOptions: { ...searchBar, hideWhenScrolling: true },
          ...headerItems(() => [
            pageMenu({
              name: TITLE,
              items: [
                {
                  title: 'Copy link',
                  symbol: 'link',
                  onPress: () => {
                    void copyText(canonicalUrl(PATH)).then((copied) => {
                      if (copied) haptic('success');
                    });
                  },
                },
                {
                  title: 'Open on opax.com.au',
                  symbol: 'arrow.up.right.square',
                  onPress: () => void openOnWeb(PATH, TITLE),
                },
              ],
            }),
            filtersButton,
          ]),
        }}
      />
      {/* The iPad sidebar floats over a bare list; this keeps rows clear of
          it, and on regular width the rows keep the readable column. */}
      <SidebarSafe style={styles.screen}>
        <ReportInset.Provider value={setInset}>
          <VoteInset.Provider value={inset}>
            <StatePageProvider refreshing={refreshing}>
              <SectionList
                onScroll={scrollTitle.onScroll}
                scrollEventThrottle={16}
                testID="division-history-screen"
                style={styles.screen}
                contentContainerStyle={[styles.content, column.content]}
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
                    {loaded && !complete ? (
                      <Skeleton shape="rows" count={2} label="Loading votes" />
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
