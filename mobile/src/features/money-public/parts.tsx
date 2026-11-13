import { type Href } from 'expo-router';
import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  AccessibilityInfo,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { SearchBarProps } from 'react-native-screens';
import { ApiError } from '../../api/errors';
import { copy } from '../../design/copy';
import { formatDate, sourceName } from '../../design/format';
import { useRefreshCommand } from '../../design/keyboard';
import {
  EmptyState,
  Group,
  RegionProvider,
  SidebarSafe,
  Text,
  useScreenColumn,
  type SourceCitation,
} from '../../design/primitives';
import type { RowMenuAction } from '../../design/row-link';
import { useListSearchBar } from '../../design/search-bar';
import {
  ContentUnavailable,
  OfflineLine,
  Skeleton,
  StatePageProvider,
} from '../../design/states';
import { colors, hairline, layout, rhythm } from '../../design/tokens';
import { headerItems, pageItems } from '../../navigation/chrome';
import { openOnWeb } from '../../navigation/external';
import { canShare, copyRecordLink, shareRecord } from '../../navigation/share';
import { useFloatingBarFoot } from '../../navigation/floating-bar';

// The registers behind public money, by their publishers' short names
// (specs/money.md 1.2): the line says "AusTender", the sheet the full title,
// and neither says how the export was built ("Latest contract notice per
// amendment lineage"; the caveats say it in plain words).
const registers: [RegExp, SourceCitation][] = [
  [
    /^AusTender\b/i,
    { label: 'AusTender', title: 'AusTender, Department of Finance' },
  ],
  [
    /^GrantConnect\b/i,
    {
      label: 'GrantConnect',
      title: 'GrantConnect grant awards, Department of Finance',
    },
  ],
  [
    /^(QLD|Queensland) Government Investment Portal\b/i,
    {
      label: 'Queensland Treasury',
      title: 'Queensland Government Investment Portal (data.qld.gov.au)',
    },
  ],
  [
    /^Centre for Public Integrity\b/i,
    {
      label: 'Centre for Public Integrity',
      title: 'Centre for Public Integrity, Table 3',
    },
  ],
  [/^(AEC|Australian Electoral Commission)\b/i, { label: 'AEC', title: 'AEC' }],
];
/** A money export's raw source as `{ label, title }` for a SourceLine. */
export function moneyCitation(raw: string): SourceCitation {
  const text = raw.trim();
  const known = registers.find(([pattern]) => pattern.test(text));
  return known ? known[1] : sourceName(text);
}
/** The short publisher name for an original's label. */
export const moneyRegister = (raw: string) => moneyCitation(raw).label;

const isoDate = /\b(\d{4}-\d{2}-\d{2})\b/g;
/**
 * An export's note with its ISO dates read as dates ("awards published 30
 * Mar 2011 to 1 May 2028"), as the date rule asks.
 */
export function readableDates<T extends string | null | undefined | false>(
  note: T,
): T {
  return (
    typeof note === 'string'
      ? note.replace(isoDate, (iso) => formatDate(iso, 'short') || iso)
      : note
  ) as T;
}

/** A grant financial year as published, "2024-25", read "2024–25". */
export const fy = (year: string) => year.replace(/^(\d{4})-(\d{2})$/, '$1–$2');
/** "2010–11 to 2027–28", or one year alone. */
export function fyRange(first: string, last: string) {
  if (!first && !last) return '';
  if (!first || !last || first === last) return fy(first || last);
  return `${fy(first)} to ${fy(last)}`;
}
/** "2013 to 2026" from two dates or years; one year alone when equal. */
export function yearRange(first: string | number, last: string | number) {
  const a = String(first).slice(0, 4),
    b = String(last).slice(0, 4);
  if (!a && !b) return '';
  return !a || !b || a === b ? a || b : `${a} to ${b}`;
}
/** "5,962 grants", "1 grant". */
export { counted } from '../../design/format';

/** A whole-screen catalog record's saved state, for the source line. */
export type Saved =
  | {
      stale: boolean;
      savedAt: number | null;
      partial?: boolean;
      staleReason?: string;
    }
  | null
  | undefined;
/**
 * Saved and partial live in the SourceLine (specs/money.md 1.5): the line
 * says "Saved 7 Nov 2026" or "· partial", its sheet says why.
 */
export function recordSource(record: Saved) {
  return {
    savedAt: record?.stale ? record.savedAt : null,
    state: record?.partial ? ('partial' as const) : null,
    stateNotes: [
      record?.stale
        ? "The latest records couldn't be loaded. Showing the saved copy."
        : null,
      record?.partial ? copy.partialNote : null,
    ],
  };
}

/**
 * The bar for a money page: Share (only with a web page to share), then ⋯
 * with "Ask about {name}" where the page has one, Copy link and Open on
 * opax.com.au. A page with no web path has no Share and no Copy link.
 */
export function moneyBar(options: {
  name: string;
  /** The share title when it says more than the name ("Largest grants, August 2026"). */
  shareTitle?: string;
  path?: string | null;
  share?: boolean;
  ask?: (() => void) | null;
  extra?: RowMenuAction[];
  filters?: { active: boolean; href: Href };
}) {
  const { name, path, ask, extra = [], filters } = options;
  const shareable = !!path && options.share !== false;
  const share = () =>
    void shareRecord({ path: path!, title: options.shareTitle ?? name });
  const menu: RowMenuAction[] = [
    ...extra,
    // Filters take the bar's one direct button; Share moves into ⋯.
    ...(shareable && filters && canShare
      ? [
          {
            title: copy.share,
            symbol: 'square.and.arrow.up' as const,
            onPress: share,
          },
        ]
      : []),
    ...(ask
      ? [
          {
            title: `Ask about ${name}`,
            symbol: 'text.bubble' as const,
            onPress: ask,
          },
        ]
      : []),
    ...(shareable
      ? [
          {
            title: copy.copyLink,
            symbol: 'link' as const,
            onPress: () => void copyRecordLink(path!),
          },
        ]
      : []),
    ...(path
      ? [
          {
            title: copy.openOnWeb,
            symbol: 'safari' as const,
            onPress: () => void openOnWeb(path, name, { preferNative: false }),
          },
        ]
      : []),
  ];
  return headerItems(
    menu.length || filters
      ? pageItems({
          name,
          share: shareable && !filters ? share : undefined,
          filters,
          menu,
        })
      : undefined,
  );
}

/** "What has parliament said about {name}?" (journeys/ask.md 14). */
export const askAbout = (name: string) =>
  `What has parliament said about ${name}?`;

/**
 * The bar's own search field (specs/money.md 1.3): `stacked` under a large
 * title, visible on first appearance and hidden by scrolling after it; or,
 * on Program and Agency, a search button that expands in the bar.
 */
export function useMoneySearch(
  placeholder: string,
  placement: 'stacked' | 'button' = 'stacked',
) {
  const [query, setQuery] = useState('');
  const [appeared, setAppeared] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAppeared(true), 0);
    return () => clearTimeout(timer);
  }, []);
  const bar = useListSearchBar({
    placeholder,
    onChangeText: setQuery,
    onSearchButtonPress: setQuery,
    onCancelButtonPress: () => setQuery(''),
  });
  const { ref } = bar;
  // Changing views clears the field as well as the filter, so the bar never
  // shows text the list no longer applies.
  const clear = useCallback(() => {
    setQuery('');
    if (ref && typeof ref === 'object') ref.current?.clearText();
  }, [ref]);
  const options: SearchBarProps =
    placement === 'button'
      ? {
          ...bar,
          placement: 'integratedButton',
          allowToolbarIntegration: false,
        }
      : { ...bar, placement: 'stacked', hideWhenScrolling: appeared };
  return { query, setQuery, clear, options };
}
/** Case-insensitive match of a query against a row's words. */
export const matches = (
  query: string,
  ...words: (string | null | undefined)[]
) =>
  !query.trim() ||
  words
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-AU')
    .includes(query.trim().toLocaleLowerCase('en-AU'));

/**
 * A changing count said to VoiceOver once, 600 ms after it stops changing
 * (typing in the search field), never on every keystroke.
 */
export function useDebouncedAnnounce(message: string | null, delay = 600) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(
      () => AccessibilityInfo.announceForAccessibility(message),
      delay,
    );
    return () => clearTimeout(timer);
  }, [message, delay]);
}
/** A list's one caption: the count and the order ("500 programs, largest first"). */
export function ListCaption({
  children,
  announce = false,
  testID,
}: {
  children: string;
  /** Searching: say the new count once typing stops. */
  announce?: boolean;
  testID?: string;
}) {
  useDebouncedAnnounce(announce ? children : null);
  return (
    <Text wordSafe variant="footnote" testID={testID}>
      {children}
    </Text>
  );
}
/**
 * A large-title screen's title for Maestro and VoiceOver order: the native
 * bar draws it; this zero-height element keeps the screen's title test ID.
 */
export function TitleAlias({
  title,
  testID,
}: {
  title: string;
  testID: string;
}) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={styles.alias}
    >
      <Text testID={testID} style={styles.alias}>
        {title}
      </Text>
    </View>
  );
}

/** A whole-screen read's state (useCatalogRecord). */
export interface MoneyStatusInput {
  record: Saved;
  error: unknown;
  retry: () => void;
}
/**
 * The money group's states from one kit (specs/money.md 1.5): a skeleton in
 * the final shape, ContentUnavailable for an error, an offline first load
 * or a record the data no longer has, and one OfflineLine on a saved copy.
 * Saved and partial are said in the SourceLine (recordSource). Renders
 * nothing when the record is fresh.
 */
export function MoneyStatus({
  status,
  name,
  rows = 6,
  figure = true,
  notFound,
  testID,
}: {
  status: MoneyStatusInput;
  /** The screen's name: "Commonwealth grants". */
  name: string;
  rows?: number;
  figure?: boolean;
  notFound?: {
    title: string;
    action?: { label: string; onPress: () => void };
  };
  testID: string;
}) {
  const { record, error } = status;
  if (record)
    return record.stale && !record.staleReason ? (
      <OfflineLine savedAt={record.savedAt} testID={`${testID}-offline`} />
    ) : null;
  if (!error)
    return (
      <View style={styles.skeleton} testID={`${testID}-loading`}>
        {figure ? (
          <Skeleton shape="figure" count={1} label={`Loading ${name}`} />
        ) : null}
        <Skeleton
          shape="rows"
          count={rows}
          label={figure ? `Loading ${name}` : `Loading ${name}`}
        />
      </View>
    );
  if (error instanceof ApiError && ['offline', 'timeout'].includes(error.code))
    return (
      <ContentUnavailable
        symbol="wifi.slash"
        title={copy.notSaved}
        body={copy.notSavedBody}
        testID={`${testID}-offline-uncached`}
      />
    );
  if (error instanceof ApiError && error.code === 'not-found' && notFound)
    return (
      <ContentUnavailable
        symbol="magnifyingglass"
        title={notFound.title}
        action={
          notFound.action
            ? { ...notFound.action, testID: `${testID}-missing-action` }
            : undefined
        }
        testID={`${testID}-missing`}
      />
    );
  return (
    <ContentUnavailable
      symbol="exclamationmark.triangle"
      title={`${name} couldn't be loaded`}
      body="Check your connection and try again."
      action={{
        label: copy.tryAgain,
        onPress: status.retry,
        testID: `${testID}-retry`,
      }}
      testID={`${testID}-error`}
    />
  );
}

/**
 * Every money list (specs/money.md 1.3): one list on paper in the readable
 * column. The header holds the title block, figure, picker and caption; the
 * rows follow with inset separators; then the footer rows. No "End of
 * record": the `*-end` view is 1 pt, kept for flows.
 */
export function MoneyList<T>({
  rows,
  rowKey,
  render,
  header,
  footer,
  sourceLine,
  empty,
  refreshing,
  refresh,
  id,
  loaded,
  onScroll,
  listRef,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  render: (row: T, index: number) => ReactNode;
  header: ReactNode;
  footer?: ReactNode;
  /** A list whose block is the list itself: its source line at the foot. */
  sourceLine?: ReactNode;
  /** Drawn in place of rows after a successful load with none to show. */
  empty?: ReactNode;
  refreshing: boolean;
  refresh: () => void;
  id: string;
  loaded: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** The list itself, for a screen that scrolls it (Largest's month). */
  listRef?: Ref<FlatList<T>>;
}) {
  const column = useScreenColumn('readable');
  const foot = useFloatingBarFoot();
  useRefreshCommand(refresh, refreshing);
  return (
    <SidebarSafe style={styles.screen}>
      <StatePageProvider refreshing={refreshing}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={rowKey}
          testID={id}
          style={styles.screen}
          contentContainerStyle={[styles.content, column.content, foot]}
          onLayout={column.onLayout}
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
          ListHeaderComponent={
            <RegionProvider value={column.inner}>
              {column.bar}
              <Group style={styles.header}>{header}</Group>
            </RegionProvider>
          }
          ItemSeparatorComponent={Separator}
          ListFooterComponent={
            loaded ? (
              <Group style={styles.footer}>
                {rows.length ? <View style={styles.rule} /> : null}
                {sourceLine ? (
                  <View testID={`${id}-source-foot`}>{sourceLine}</View>
                ) : null}
                {footer}
                <View testID={`${id}-end`} style={styles.end} />
              </Group>
            ) : null
          }
          ListEmptyComponent={
            loaded ? (
              <>
                {empty === undefined ? (
                  <EmptyState message="No matching records." />
                ) : (
                  empty
                )}
              </>
            ) : null
          }
          renderItem={({ item, index }) => <View>{render(item, index)}</View>}
        />
      </StatePageProvider>
    </SidebarSafe>
  );
}
function Separator() {
  return <View style={styles.separator} />;
}
/** A list's first page: ten rows. */
export const FIRST_PAGE = 10;
/**
 * The row a first page's source line follows: the last row of the first
 * page, in the first column of a grid, or -1 for an empty list.
 */
export function sourceIndex(rows: number, columns = 1): number {
  if (!rows) return -1;
  const last = Math.min(FIRST_PAGE * columns, rows) - 1;
  return last - (last % columns);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: layout.screenMargin,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.section,
  },
  header: { paddingBottom: rhythm.tight },
  footer: { paddingTop: rhythm.block },
  separator: { height: hairline, backgroundColor: colors.dividerSubtle },
  rule: {
    height: hairline,
    backgroundColor: colors.dividerSubtle,
    marginTop: -rhythm.block,
    marginBottom: rhythm.block,
  },
  end: { height: 1 },
  skeleton: { gap: rhythm.block },
  alias: { height: 0, width: 0, opacity: 0, overflow: 'hidden' },
});
