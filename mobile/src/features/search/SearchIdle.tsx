import { ElectionSearchRow } from '../vic-election/SearchRow';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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

/**
 * The daily edition as the app cache holds it (Today reads it first), for
 * the Try group only. A failed or missing read draws no edition row.
 */
function useCachedEdition() {
  const [edition, setEdition] = useState<EditionView | null>(null);
  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => catalogs.todayEdition())
      .then((block) => {
        if (active && block?.status === 'ready' && block.data)
          setEdition(block.data);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return edition;
}

/**
 * Search, idle (journeys/search.md 3.2): Recent (only when there is one),
 * then Try (sweep 1 item 5: rows chosen by rule in `try.ts`, two when
 * Recent shows), then Browse. No `SourceLine`: nothing here is a figure.
 */
export function SearchIdle({
  onRecent,
  onTry,
  bills = null,
}: {
  onRecent: (item: RecentSearch) => void;
  /** A Try row with no native record searches its words. */
  onTry?: (q: string) => void;
  /** The bill index Search already holds for suggestions. */
  bills?: BillIndex | null;
}) {
  const recent = useRecentSearches();
  const member = useContext(MyMemberContext) ?? null;
  const edition = useCachedEdition();
  const tries = useMemo(
    () =>
      tryRows({
        member,
        edition,
        bills,
        hasRecent: recent.items.length > 0,
      }),
    [member, edition, bills, recent.items.length],
  );
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
              titleLines={TRY_TITLE_LINES}
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
