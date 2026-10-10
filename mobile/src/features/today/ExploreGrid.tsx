import { StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  Card,
  Hoverable,
  IconTile,
  Section,
  Text,
  useAccessibilitySize,
  type SFSymbol,
} from '../../design/primitives';
import { radii, rhythm } from '../../design/tokens';
import {
  leadsRoute,
  moneyRoute,
  recentRecordsRoute,
} from '../../navigation/routes';
import { communityHome } from '../community/entry';

interface Tile {
  title: string;
  detail: string;
  icon: SFSymbol;
  /** Spoken after the title and detail, where the tile needs a caveat. */
  note?: string;
  hint: string;
  route: Href;
  testID: string;
}

// Static ways in: each screen loads its own export when it opens, so Today
// reads nothing for them. The test IDs are the ones the journeys know.
// Community has a tile only in builds that ship it (not production 1.0).
const tiles: readonly Tile[] = [
  {
    title: 'Leads',
    detail: 'Contracts and party funding',
    icon: 'point.3.connected.trianglepath.dotted',
    note: 'Each lead keeps its caveats; a lead is not a finding.',
    hint: 'Opens all leads',
    route: leadsRoute,
    testID: 'today-leads-open',
  },
  {
    title: 'Money map',
    detail: 'Donations and public money',
    icon: 'map',
    hint: 'Opens the native money map',
    route: moneyRoute(),
    testID: 'today-money-map',
  },
  {
    title: 'Public money',
    detail: 'Grants, contracts and agencies',
    icon: 'banknote',
    hint: 'Opens public money',
    route: '/public-money',
    testID: 'today-public-money',
  },
  {
    title: 'Reports',
    detail: 'Standing investigations and topics',
    icon: 'chart.bar.doc.horizontal',
    hint: 'Opens the reports',
    route: { pathname: '/reports' },
    testID: 'today-reports',
  },
  ...(communityHome
    ? [
        {
          title: 'Community',
          detail: 'Questions and sources worth following',
          icon: 'bubble.left.and.bubble.right',
          hint: 'Opens Community',
          route: communityHome,
          testID: 'today-community',
        } satisfies Tile,
      ]
    : []),
  {
    title: 'Explore',
    detail: 'Play with the parliamentary record',
    icon: 'square.grid.2x2',
    hint: 'Opens Explore',
    route: '/explore',
    testID: 'today-explore-open',
  },
  {
    title: 'Just added',
    detail: 'Newly indexed records',
    icon: 'tray.full',
    hint: 'Opens the newest records',
    route: recentRecordsRoute,
    testID: 'today-records-open',
  },
];

/**
 * Every other way into the record as one tile grid under one heading: one
 * card style, a symbol on the brand's tile, a title and one line. Two tiles
 * a row; an odd last tile takes the row. At accessibility sizes each tile
 * takes the full width. The edition stays Today's only colour.
 */
export function ExploreGrid() {
  const stacked = useAccessibilitySize();
  return (
    <Section title="Explore the record" testID="today-explore">
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View
            key={tile.testID}
            style={[styles.cell, stacked ? styles.cellFull : null]}
          >
            <TileCard tile={tile} />
          </View>
        ))}
      </View>
    </Section>
  );
}

function TileCard({ tile }: { tile: Tile }) {
  const open = () => router.push(tile.route);
  return (
    <Hoverable
      effect="lift"
      cornerRadius={radii.md}
      onActivate={open}
      style={styles.fill}
    >
      <Card
        onPress={open}
        accessibilityLabel={[`${tile.title}.`, `${tile.detail}.`, tile.note]
          .filter(Boolean)
          .join(' ')}
        accessibilityHint={tile.hint}
        style={styles.card}
        testID={tile.testID}
      >
        <IconTile name={tile.icon} />
        <View style={styles.text}>
          <Text wordSafe variant="strong">
            {tile.title}
          </Text>
          <Text wordSafe variant="metadata">
            {tile.detail}
          </Text>
        </View>
      </Card>
    </Hoverable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    gap: rhythm.heading,
  },
  // Two to a row; flexGrow lets an odd last tile take its row.
  cell: { flexGrow: 1, flexBasis: '40%' },
  cellFull: { flexBasis: '100%' },
  fill: { flexGrow: 1 },
  card: { flexGrow: 1, gap: rhythm.heading },
  text: { gap: 2 },
});
