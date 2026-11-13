import { RouteOptions } from '../../navigation/preview';
import { useAndroidRootScroll } from '../../navigation/useAndroidRootScroll';
import {
  router,
  useLocalSearchParams,
  type NativeStackHeaderItem,
} from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ComponentType,
} from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type TextLayoutEvent,
  type ViewToken,
} from 'react-native';
import { billName } from '../../api/bill-transforms';
import { billsFor } from '../../api/catalogs';
import { ApiError } from '../../api/errors';
import { catalogs } from '../../api/runtime';
import { copy } from '../../design/copy';
import { formatDate } from '../../design/format';
import { useRefreshCommand } from '../../design/keyboard';
import {
  Button,
  ContentUnavailable,
  Divider,
  EmptyState,
  IconButton,
  InlineError,
  LayoutRegion,
  LinkRow,
  OfflineLine,
  PopUpButton,
  SegmentedPicker,
  SidebarSafe,
  Skeleton,
  SourceLine,
  SplitLayout,
  Text,
  isPad,
  useAccessibilitySize,
  useAdaptiveDevice,
  useLayout,
} from '../../design/primitives';
import { useListSearchBar } from '../../design/search-bar';
import { StatePageProvider } from '../../design/states';
import { colors, layout, rhythm } from '../../design/tokens';
import {
  filtersItem,
  headerItems,
  rootHeaderItems,
} from '../../navigation/chrome';
import { billRoute } from '../../navigation/routes';
import { divisionHistoryRoute } from '../../navigation/routes/bills';
import { filtersRoute } from '../../navigation/routes/filters';
import { resultsRoute } from '../../navigation/routes/search';
import { shareRecord } from '../../navigation/share';
import { useAccount } from '../account/store';
import { scopedQuestion } from '../ask/AskAbout';
import { useOpenAsk } from '../ask/open';
import BillTextReader from '../records/BillTextReader';
import { ScopeChips } from '../search/ScopeChips';
import { BillTextPaneBar } from '../split/RecordDetail';
import {
  billEntryFromRoute,
  entryRoute,
  useSplitSelectionParams,
} from '../split/entry';
import BillDetail, { PaneMenu } from './BillDetail';
import {
  activeFilterCount,
  billRows,
  countLine,
  isScope,
  scopeTotal,
  scopes,
  sortLabels,
  useBillListState,
  useBoundBillsModel,
  type BillScope,
  type BillSort,
} from './filters';
import type { BillEntry } from './navigation';
import { BillIndexRow } from './parts';
import { useCatalogRecord } from './useCatalogRecord';

// Short enough for the bar's field on a phone and beside a Duo's split
// ("Bills, sponsors and por…" at 240pt). The field still matches sponsors
// and portfolios. react-native-screens 4.26 gives the native field no
// accessibility label of its own, so VoiceOver reads this placeholder.
export const PLACEHOLDER = 'Search bills';
const LIST_NOTE = 'This list may not include every bill yet.';

/**
 * Bills: the tab root, or the same list pushed in another tab
 * (`/bill-list`). On iPad regular width it is a split: this list on the
 * left, the selected bill (and its text) in the detail pane.
 */
export default function BillsList({ pushed = false }: { pushed?: boolean }) {
  const adaptive = useAdaptiveDevice();
  if (!adaptive) return <BillsScreen pushed={pushed} />;
  return (
    <SidebarSafe style={styles.screen}>
      <LayoutRegion style={styles.screen}>
        <BillsScreen pushed={pushed} />
      </LayoutRegion>
    </SidebarSafe>
  );
}
/** `/bill-list`: its own scope, filters and sort, from its route params. */
export function PushedBillsList() {
  return <BillsList pushed />;
}

let pushedLists = 0;
/** Old links: `?status=passed` is the scope; `?year=2024` is search text. */
export function listParams(params: {
  scope?: string;
  status?: string;
  sort?: string;
  q?: string;
  year?: string;
}): { scope?: BillScope; sort?: BillSort; q: string } {
  const status = params.status;
  const scope: BillScope | undefined = isScope(params.scope)
    ? params.scope
    : params.year
      ? 'all'
      : status === 'passed'
        ? 'passed'
        : status === 'before_parliament' || status === 'before'
          ? 'before'
          : status
            ? 'all'
            : undefined;
  const sort =
    params.sort === 'newest' ||
    params.sort === 'oldest' ||
    params.sort === 'title' ||
    params.sort === 'divisions'
      ? params.sort
      : undefined;
  const q = (
    params.q ?? (params.year && /^\d{4}$/.test(params.year) ? params.year : '')
  ).trim();
  return { scope, sort, q };
}

function BillsScreen({ pushed }: { pushed: boolean }) {
  const adaptive = useAdaptiveDevice();
  const setSelectionParams = useSplitSelectionParams();
  const params = useLocalSearchParams<{
    bill?: string;
    scope?: string;
    status?: string;
    sort?: string;
    q?: string;
    year?: string;
    focus?: string;
  }>();
  const [initial] = useState(() => listParams(params));
  const [owner] = useState(() => (pushed ? `list-${++pushedLists}` : 'tab'));
  const list = useBillListState(owner, initial);
  const { scope, setScope, filters } = list;
  const load = useCallback(
    (refresh: boolean, _publish: unknown, signal?: AbortSignal) =>
      catalogs.bills(refresh, signal),
    [],
  );
  const { record, error, refreshing, refresh, retry } = useCatalogRecord(load);
  useRefreshCommand(refresh, refreshing);
  const [text, setText] = useState(initial.q);
  const [query, setQuery] = useState(initial.q);
  // Filter as the reader types, a beat behind the keyboard.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 150);
    return () => clearTimeout(timer);
  }, [text]);

  const index = record?.data;
  // Every bill as a display row, in index order; searched rows separately.
  const all = useMemo(() => (index ? billsFor(index).data! : null), [index]);
  const searched = useMemo(
    () => (index && query ? billsFor(index, { query }).data! : all),
    [index, query, all],
  );
  useBoundBillsModel(owner, all, scope);
  const rows = useMemo(
    () => (searched ? billRows(searched, filters, scope) : []),
    [searched, filters, scope],
  );
  const on = activeFilterCount(filters, scope);
  const total = all ? scopeTotal(all, scope) : 0;
  const searching = !!query;

  // Two panes (the split breakpoint): the selection lives in the route (`?bill=…`).
  const split = useLayout().split;
  const selectedKey = params.bill || null;
  const titleFor = useCallback(
    (key: string) => {
      const bill = index?.bills.find((b) => b.key === key);
      return bill ? billName(bill) : undefined;
    },
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
  const androidRoot = useAndroidRootScroll(listRef, colors.paper);
  const visible = useRef(new Set<string>());
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
      Keyboard.dismiss();
      setSelectionParams({ bill: entry?.key ?? '' });
      const at = entry ? rows.findIndex((bill) => bill.key === entry.key) : -1;
      if (at >= 0 && !visible.current.has(entry!.key))
        listRef.current?.scrollToIndex({
          index: at,
          viewPosition: 0.5,
          animated: true,
        });
    },
    [rows, setSelectionParams],
  );
  const offline = error instanceof ApiError && error.code === 'offline';
  const account = useAccount();
  const signedIn = !!account.status?.signedIn;
  const searchBar = useSearchBarOptions(setText, params.focus === '1');

  const sort = filters.sort ?? 'newest';
  const filtersButton: NativeStackHeaderItem = {
    ...(filtersItem({
      active: on > 0,
      href: filtersRoute('bills', owner),
    }) as Extract<NativeStackHeaderItem, { type: 'button' }>),
    accessibilityLabel: [
      'Filters',
      on ? `${on} on` : null,
      sort !== 'newest' ? `sorted by ${sortLabels[sort].toLowerCase()}` : null,
    ]
      .filter(Boolean)
      .join(', '),
    ...(all ? {} : { accessibilityHint: 'Available once bills load' }),
    disabled: !all,
  };
  const options = {
    headerSearchBarOptions: searchBar,
    ...(pushed ? { title: 'Bills', headerLargeTitleEnabled: false } : {}),
    ...(isPad && !pushed ? { headerLargeTitleEnabled: !split } : {}),
    ...headerItems(() =>
      pushed
        ? [filtersButton]
        : rootHeaderItems({
            segment: '(bills)',
            signedIn,
            extra: [filtersButton],
          }),
    ),
  };

  const clear = () => list.store.set(list.store.model.reset(list.state));
  const stacked = useAccessibilitySize();
  const filteredEmpty = !!all && !searching && on > 0 && rows.length === 0;
  const header = (
    <View style={styles.headerStack}>
      {searching ? null : (
        <LinkRow
          title="Votes in parliament"
          symbol="hand.raised"
          onPress={() => router.push(divisionHistoryRoute)}
          testID="bills-votes"
        />
      )}
      <ScopeControl value={scope} onChange={setScope} />
      {record?.stale ? (
        record.staleReason ? (
          <InlineError
            subject="the latest bills"
            message={`The latest bills couldn't be loaded. Showing the copy saved on ${formatDate(record.savedAt, 'short').replace(/ \d{4}$/, '')}.`}
            onRetry={refresh}
            testID="bills-stale"
          />
        ) : (
          <OfflineLine savedAt={record.savedAt} testID="bills-offline" />
        )
      ) : null}
      {all ? (
        <View style={[styles.count, stacked ? styles.countStacked : null]}>
          <Text
            variant="secondary"
            wordSafe
            testID="bills-count"
            style={stacked ? null : styles.grow}
          >
            {searching
              ? countLine(rows.length, rows.length, false)
              : countLine(rows.length, total, on > 0)}
          </Text>
          {on > 0 && !filteredEmpty && !searching ? (
            <Button
              label="Clear filters"
              variant="plain"
              onPress={clear}
              testID="bills-clear"
            />
          ) : null}
        </View>
      ) : !record && !error ? (
        <Skeleton shape="text" count={1} label="Loading bills" />
      ) : null}
    </View>
  );

  const body = !record ? (
    offline ? (
      <ContentUnavailable
        symbol="wifi.slash"
        title={copy.notSaved}
        body={copy.notSavedBody}
        testID="bills-offline-uncached"
      />
    ) : error ? (
      <ContentUnavailable
        symbol="exclamationmark.triangle"
        title="Bills couldn't be loaded"
        action={{
          label: copy.tryAgain,
          onPress: retry,
          testID: 'bills-error-retry',
        }}
        testID="bills-error"
      />
    ) : (
      <Skeleton
        shape="rows"
        count={6}
        label="Loading bills"
        testID="bills-loading"
      />
    )
  ) : searching && !rows.length ? (
    <View>
      <ContentUnavailable
        symbol="magnifyingglass"
        title={`No results for "${query}"`}
        announcement="No results"
        body={
          // The filters still apply to a search: say so, not "spelling".
          on > 0
            ? 'Filters are on. Clear them to search every bill.'
            : 'Check the spelling or try a new search.'
        }
        testID="bills-search-empty"
      />
      {on > 0 ? (
        <Button
          label="Clear filters"
          variant="secondary"
          onPress={clear}
          testID="bills-search-clear"
        />
      ) : null}
      {scope !== 'all' ? (
        <Button
          label="Search all bills"
          variant="secondary"
          onPress={() => setScope('all')}
          testID="bills-search-all"
        />
      ) : null}
      <Button
        label={`Search OPAX for "${query}"`}
        variant="plain"
        onPress={() => router.push(resultsRoute('all', { q: query }))}
        testID="bills-search-opax"
      />
    </View>
  ) : filteredEmpty ? (
    <ContentUnavailable
      symbol="line.3.horizontal.decrease.circle"
      title="No bills match these filters"
      action={{ label: 'Clear filters', onPress: clear, testID: 'bills-clear' }}
      testID="bills-empty"
    />
  ) : !rows.length && scope === 'before' ? (
    <ContentUnavailable
      symbol="doc.text"
      title="No bills before parliament"
      action={{
        label: 'Show all bills',
        onPress: () => setScope('all'),
        testID: 'bills-show-all',
      }}
      testID="bills-empty"
    />
  ) : null;

  // The list's one source line, at its foot.
  const footer = all ? (
    <SourceLine
      asOf={index?.generated_at}
      citation={['ParlInfo']}
      originals={[
        {
          label: 'ParlInfo',
          url: 'https://parlinfo.aph.gov.au/',
          record: 'bills register',
        },
      ]}
      savedAt={record?.stale ? record.savedAt : null}
      state={record?.partial ? 'partial' : null}
      notes={[
        LIST_NOTE,
        record?.partial ? "Some records couldn't be read." : null,
      ]}
      testID="bills-as-at"
    />
  ) : null;

  const listView = (
    <StatePageProvider refreshing={refreshing}>
      <FlatList
        ref={listRef}
        testID="bills-screen"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.navy}
          />
        }
        style={styles.screen}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        data={record ? rows : []}
        keyExtractor={(bill) => bill.key}
        renderItem={({ item }) => (
          <BillIndexRow
            bill={item}
            showStatus={scope === 'all'}
            selected={
              split ? item.key === (selected ?? firstEntry())?.key : undefined
            }
            onPress={
              split
                ? () =>
                    select({
                      kind: 'bill',
                      key: item.key,
                      title: billName(item),
                    })
                : () => router.push(billRoute(item.key, billName(item)))
            }
          />
        )}
        extraData={split ? selectedKey : scope}
        onViewableItemsChanged={adaptive ? onViewable : undefined}
        onScrollToIndexFailed={({ index: at, averageItemLength }) =>
          listRef.current?.scrollToOffset({
            offset: averageItemLength * at,
            animated: true,
          })
        }
        ItemSeparatorComponent={() => <Divider variant="subtle" />}
        ListHeaderComponent={
          Platform.OS === 'android' ? (
            <>
              {androidRoot.title}
              {header}
            </>
          ) : (
            header
          )
        }
        {...(Platform.OS === 'android'
          ? { onScroll: androidRoot.onScroll, scrollEventThrottle: 16 }
          : {})}
        ListHeaderComponentStyle={styles.header}
        ListFooterComponent={rows.length ? footer : null}
        ListFooterComponentStyle={styles.footer}
        ListEmptyComponent={body}
        initialNumToRender={12}
      />
    </StatePageProvider>
  );
  function firstEntry(): BillEntry | null {
    const first = rows[0];
    return first
      ? { kind: 'bill', key: first.key, title: billName(first) }
      : null;
  }
  if (!adaptive)
    return (
      <>
        <RouteOptions options={options} />
        {listView}
      </>
    );
  return (
    <>
      <RouteOptions options={options} />
      <SplitLayout<BillEntry>
        id="bills"
        testID="bills-split"
        list={listView}
        selected={selected}
        // The pane never opens empty while the scope has rows.
        initialSelection={firstEntry}
        onSelect={select}
        entryKey={(entry) => `${entry.kind}:${entry.key}`}
        entryRoute={entryRoute}
        entryFromRoute={billEntryFromRoute}
        entryTitle={(entry) => (entry.kind === 'bill' ? 'Bill' : 'Bill text')}
        renderDetail={(entry) =>
          entry.kind === 'bill' ? (
            <BillDetail recordKey={entry.key} embedded />
          ) : (
            <BillTextReader recordKey={entry.key} embedded />
          )
        }
        detailActions={(entry) =>
          entry.kind === 'text' ? (
            <BillTextPaneBar billKey={entry.key} />
          ) : (
            <PaneActions
              billKey={entry.key}
              title={entry.title ?? titleFor(entry.key) ?? 'Bill'}
            />
          )
        }
        keys={rows.map((bill) => bill.key)}
        entryForKey={(key) => ({ kind: 'bill', key, title: titleFor(key) })}
        empty={
          <EmptyState
            size="pane"
            message="No bill selected"
            testID="bills-split-empty"
          />
        }
      />
    </>
  );
}

function useSearchBarOptions(
  setText: (text: string) => void,
  autoFocus: boolean,
) {
  const options = useListSearchBar({
    placeholder: PLACEHOLDER,
    onChangeText: setText,
    onSearchButtonPress: (value) => {
      setText(value);
      Keyboard.dismiss();
    },
    onCancelButtonPress: () => setText(''),
    autoFocus,
  });
  return { ...options, hideWhenScrolling: true };
}

/**
 * Before parliament | Passed | All, as segments only when every label fits
 * its third of the width (measured, not tied to a text size); otherwise a
 * "Showing" row with the choice as a menu.
 */
/**
 * PopUpButton in its menu row: the label above the current choice. The row
 * mode is MenuPicker's, which PopUpButton passes through but does not type
 * (Follow-up in the fix round's last commit).
 */
const MenuRow = PopUpButton as unknown as ComponentType<
  ComponentProps<typeof PopUpButton<BillScope>> & { row: true }
>;

function ScopeControl({
  value,
  onChange,
}: {
  value: BillScope;
  onChange: (scope: BillScope) => void;
}) {
  const [width, setWidth] = useState(0);
  const [widest, setWidest] = useState<Record<string, number>>({});
  const measure = (key: string) => (event: TextLayoutEvent) => {
    const w = Math.max(0, ...event.nativeEvent.lines.map((l) => l.width));
    setWidest((old) => (old[key] === w ? old : { ...old, [key]: w }));
  };
  const measured = scopes.every((s) => widest[s.value] !== undefined);
  const fits =
    Platform.OS !== 'ios' ||
    !measured ||
    !width ||
    Math.max(...scopes.map((s) => widest[s.value]!)) + 24 <= width / 3;
  const options = scopes.map((s) => ({
    ...s,
    testID: `bills-scope-${s.value}`,
  }));
  if (Platform.OS === 'android')
    return (
      <ScopeChips
        label="Showing bills"
        options={options}
        value={value}
        onChange={onChange}
        testID="bills-scope"
      />
    );
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.probe}
      >
        {scopes.map((s) => (
          <Text
            key={s.value}
            variant="footnote"
            style={styles.probeText}
            onTextLayout={measure(s.value)}
          >
            {s.label}
          </Text>
        ))}
      </View>
      {fits ? (
        <SegmentedPicker
          options={options}
          value={value}
          onChange={onChange}
          accessibilityLabel="Showing"
          testID="bills-scope"
        />
      ) : (
        <MenuRow
          row
          label="Showing"
          value={value}
          options={options}
          onChange={onChange}
          testID="bills-scope"
        />
      )}
    </View>
  );
}

/** The iPad detail pane's bar: Ask about this bill, Share and ⋯. */
function PaneActions({ billKey, title }: { billKey: string; title: string }) {
  const openAsk = useOpenAsk();
  return (
    <View style={styles.paneActions}>
      <IconButton
        symbol="text.bubble"
        accessibilityLabel="Ask about this bill"
        testID="bill-pane-ask"
        onPress={() => openAsk(scopedQuestion('bill', title))}
      />
      <IconButton
        symbol="square.and.arrow.up"
        accessibilityLabel="Share"
        testID="bill-pane-share"
        onPress={() => void shareRecord({ path: `/bill/${billKey}`, title })}
      />
      <PaneMenu billKey={billKey} title={title} testID="bill-pane-more" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.tight,
  },
  header: { paddingBottom: rhythm.tight },
  headerStack: { gap: rhythm.block },
  footer: { paddingTop: rhythm.group },
  count: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  countStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  grow: { flexGrow: 1, flexShrink: 1 },
  probe: { position: 'absolute', opacity: 0, left: 0, top: 0 },
  probeText: { fontWeight: '600' },
  paneActions: { flexDirection: 'row', alignItems: 'center' },
});
