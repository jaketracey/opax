import { ElectionSearchRow } from '../vic-election/SearchRow';
import { useContext, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { BillIndex } from '../../api/catalog-decoders';
import { catalogs } from '../../api/runtime';
import type { EditionView } from '../../api/selectors';
import {
  Group,
  InsetGroup,
  LinkRow,
  Text,
  type SFSymbol,
} from '../../design/primitives';
import { symbols } from '../../design/symbols';
import { colors, rhythm } from '../../design/tokens';
import { divisionHistoryRoute } from '../../navigation/routes/bills';
import { directoryRoute } from '../../navigation/routes/people';
import { publicMoneyRoute } from '../../navigation/routes/public-money';
import { topicsRoute } from '../../navigation/routes/search';
import { MyMemberContext } from '../your-mp/MyMemberContext';
import { recentSearches, useRecentSearches, type RecentSearch } from './recent';
import { scopeLabel, type Scope } from './scopes';
import { tryRows } from './try';

type Browse = {
  title: string;
  symbol: SFSymbol;
  href: Parameters<typeof LinkRow>[0]['href'];
  testID: string;
};
/** A Try row's title clamps here at every text size. */
export const TRY_TITLE_LINES = 2;
/**
 * Android's largest text sizes stop at 2.0, so a bill title there wraps
 * further instead of ending in "L.." against the chevron. iOS keeps the
 * two-line clamp at every size (its AX sizes run to nine lines).
 */
export const TRY_TITLE_LINES_ANDROID_LARGE = 6;
export function tryTitleLines(os: string, fontScale: number): number {
  return os === 'android' && fontScale > 1.3
    ? TRY_TITLE_LINES_ANDROID_LARGE
    : TRY_TITLE_LINES;
}

/** Browse, fixed order, each pushing inside the current tab. */
export const browseRows: readonly Browse[] = [
  {
    title: 'Parliamentarians',
    symbol: 'person.crop.circle',
    href: directoryRoute('person'),
    testID: 'search-browse-person',
  },
  {
    title: 'Parties',
    symbol: 'person.3',
    href: directoryRoute('party'),
    testID: 'search-browse-party',
  },
  {
    title: 'Electorates',
    symbol: 'map',
    href: directoryRoute('electorate'),
    testID: 'search-browse-electorate',
  },
  {
    title: 'Topics',
    symbol: 'number',
    href: topicsRoute,
    testID: 'search-browse-topics',
  },
  {
    title: 'Votes in parliament',
    symbol: 'hand.raised',
    href: divisionHistoryRoute,
    testID: 'search-browse-votes',
  },
  {
    title: 'Public money',
    symbol: symbols.money,
    href: publicMoneyRoute,
    testID: 'search-browse-money',
  },
];

/** The longest the idle lists wait for the edition and the bill index. */
export const IDLE_HOLD_MS = 400;

// The edition as last read this session: a later visit draws from it on its
// first frame. Null until one read has settled.
let heldEdition: { data: EditionView | null } | null = null;
/** A new session (tests start each case with none). */
export function forgetIdleEdition() {
  heldEdition = null;
}
/**
 * The daily edition as the app cache holds it (Today reads it first), for
 * the Try group only. A failed or missing read draws no edition row.
 */
function readEdition(): Promise<void> {
  return Promise.resolve()
    .then(() => catalogs.todayEdition())
    .then((block) => {
      heldEdition = {
        data: block?.status === 'ready' && block.data ? block.data : null,
      };
    })
    .catch(() => {
      heldEdition ??= { data: null };
    });
}

type TryInputs = { edition: EditionView | null; bills: BillIndex | null };
/**
 * What the Try group is drawn from, fixed at the first draw: the lists wait
 * (at most `IDLE_HOLD_MS`) for the edition and the bill index, then draw
 * once and keep those rows. A read that settles later is used by the next
 * visit, so no row is inserted above one already on screen.
 */
function useTryInputs(
  bills: BillIndex | null,
  billsSettled: boolean,
  visited: boolean,
): TryInputs | null {
  const [edition, setEdition] = useState(heldEdition);
  const [expired, setExpired] = useState(false);
  const settled = edition !== null && (bills !== null || billsSettled);
  const [drawn, setDrawn] = useState<TryInputs | null>(null);
  // The edition is read as soon as the tab is mounted (at launch), so it is
  // in hand before the first visit.
  useEffect(() => {
    let active = true;
    void readEdition().then(() => {
      if (active) setEdition(heldEdition);
    });
    return () => {
      active = false;
    };
  }, []);
  // The wait runs from the visit, not from the mount: the tab is mounted
  // long before it is opened, and its bill index is read on focus.
  useEffect(() => {
    if (!visited) return;
    const timer = setTimeout(() => setExpired(true), IDLE_HOLD_MS);
    return () => clearTimeout(timer);
  }, [visited]);
  if (drawn) return drawn;
  if (!settled && !expired) return null;
  // Fixed from this render on (state set while rendering, so the lists are
  // drawn in the same pass that learns their inputs).
  const first = { edition: edition?.data ?? null, bills };
  setDrawn(first);
  return first;
}

/**
 * Search, idle (journeys/search.md 3.2): Recent (only when there is one),
 * then Try (sweep 1 item 5: rows chosen by rule in `try.ts`, two when
 * Recent shows), then Browse. No `SourceLine`: nothing here is a figure.
 *
 * The three groups are drawn together, once, in their final places: Recent
 * is read from the device before the first draw (the read starts with the
 * app), and Try from what `useTryInputs` holds then. Nothing is inserted
 * above a group already on screen.
 */
export function SearchIdle({
  onRecent,
  onTry,
  bills = null,
  billsSettled = true,
  visited = true,
}: {
  onRecent: (item: RecentSearch) => void;
  /** A Try row with no native record searches its words. */
  onTry?: (q: string) => void;
  /** The bill index Search already holds for suggestions. */
  bills?: BillIndex | null;
  /** False while the caller is still reading the bill index. */
  billsSettled?: boolean;
  /** False until the screen is first opened (its reads start then). */
  visited?: boolean;
}) {
  const recent = useRecentSearches();
  const { fontScale } = useWindowDimensions();
  const member = useContext(MyMemberContext) ?? null;
  const inputs = useTryInputs(bills, billsSettled, visited);
  const tries = useMemo(
    () =>
      inputs
        ? tryRows({
            member,
            edition: inputs.edition,
            bills: inputs.bills,
            hasRecent: recent.items.length > 0,
          })
        : [],
    [member, inputs, recent.items.length],
  );
  if (!recent.ready || !inputs)
    return <Group gap={rhythm.group} testID="search-idle-pending" />;
  return (
    <Group gap={rhythm.group} testID="search-idle">
      {recent.items.length ? (
        <View testID="search-recent">
          <View style={styles.header}>
            <Text variant="groupHeader" accessibilityRole="header">
              Recent
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear recent searches"
              hitSlop={8}
              onPress={() => recentSearches.clear()}
              testID="search-recent-clear"
              style={styles.clear}
            >
              <Text variant="body" style={{ color: colors.navy }}>
                Clear
              </Text>
            </Pressable>
          </View>
          <InsetGroup>
            {recent.items.map((item, index) => (
              <LinkRow
                key={item.q}
                title={item.q}
                detail={
                  item.scope === 'all' ? undefined : scopeLabel(item.scope)
                }
                symbol="clock"
                accessory="none"
                accessibilityLabel={`${item.q}, recent search`}
                testID={`search-recent-${index}`}
                onPress={() => onRecent(item)}
                menu={[
                  ...(item.scope !== 'speeches'
                    ? [
                        {
                          title: 'Search speeches',
                          symbol: 'magnifyingglass' as const,
                          onPress: () =>
                            onRecent({ ...item, scope: 'speeches' as Scope }),
                        },
                      ]
                    : []),
                  {
                    title: 'Remove',
                    symbol: 'trash' as const,
                    destructive: true,
                    onPress: () => recentSearches.remove(item.q),
                  },
                ]}
              />
            ))}
          </InsetGroup>
        </View>
      ) : null}
      {tries.length ? (
        <InsetGroup header="Try" testID="search-try">
          {tries.map((row) => (
            <LinkRow
              key={row.key}
              title={row.title}
              // A bill's full title ran to nine lines at AX3, one row filling
              // the screen under the field (sweep 2, item 8.3). The whole
              // title stays in the label and on the page it opens.
              titleLines={tryTitleLines(Platform.OS, fontScale)}
              detail={row.detail}
              symbol={row.symbol}
              accessibilityLabel={`${row.title}, ${row.detail}`}
              testID={`search-try-${row.key}`}
              {...('href' in row.action
                ? { href: row.action.href as Browse['href'] }
                : {
                    onPress: () => onTry?.((row.action as { q: string }).q),
                  })}
            />
          ))}
        </InsetGroup>
      ) : null}
      <InsetGroup header="Browse" testID="search-browse">
        {browseRows.map((row) => (
          <LinkRow
            key={row.testID}
            title={row.title}
            symbol={row.symbol}
            href={row.href}
            testID={row.testID}
          />
        ))}
        <ElectionSearchRow />
      </InsetGroup>
    </Group>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: rhythm.groupHeader,
    paddingHorizontal: 4,
  },
  clear: { minHeight: 44, minWidth: 44, justifyContent: 'flex-end' },
});
