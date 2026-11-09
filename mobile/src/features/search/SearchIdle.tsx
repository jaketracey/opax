import { Pressable, StyleSheet, View } from 'react-native';
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
import { recentSearches, useRecentSearches, type RecentSearch } from './recent';
import { scopeLabel, type Scope } from './scopes';

type Browse = {
  title: string;
  symbol: SFSymbol;
  href: Parameters<typeof LinkRow>[0]['href'];
  testID: string;
};
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
 * Search, idle (journeys/search.md 3.2): Recent (only when there is one),
 * then Browse. No `SourceLine`: nothing here is a figure. "Try asking"
 * waits for the reviewed starter list (specs/search.md D-S2) and draws
 * nothing until it ships.
 */
export function SearchIdle({
  onRecent,
}: {
  onRecent: (item: RecentSearch) => void;
}) {
  const recent = useRecentSearches();
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
