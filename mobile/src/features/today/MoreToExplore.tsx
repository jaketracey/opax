import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tile, TileGrid } from '../../design/card';
import { InsetGroup, SectionHeader } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { symbols } from '../../design/symbols';
import { rhythm } from '../../design/tokens';
import {
  exploreRoute,
  largestGrantsRoute,
  leadsRoute,
  publicMoneyRoute,
  recentRecordsRoute,
} from '../../navigation/routes';

/**
 * The four ways in, in this order (today.md 5.10, the brief's tile list).
 * Static: each screen loads its own records when it opens, so Today reads
 * nothing for them. The Money map is reached from Public money's Parties
 * card; Explore is the row under the grid.
 */
export const exploreTiles = [
  {
    title: 'Public money',
    line: 'Grants and contracts by program and place',
    symbol: 'building.columns',
    ink: 'money',
    href: publicMoneyRoute,
    testID: 'today-public-money',
  },
  {
    title: 'Leads',
    line: 'Names that appear in both money and the record',
    symbol: symbols.leads,
    ink: 'interests',
    href: leadsRoute,
    testID: 'today-leads-open',
  },
  {
    title: 'Largest grants',
    line: 'The biggest new grant agreements each month',
    symbol: symbols.money,
    ink: 'money',
    href: largestGrantsRoute(),
    testID: 'today-largest-grants',
  },
  {
    title: 'Just added',
    line: 'The newest records in OPAX',
    symbol: symbols.justAdded,
    ink: 'navy',
    href: recentRecordsRoute,
    testID: 'today-records-open',
  },
] as const;

/**
 * More to explore (today.md 5.10): the header (no action); in case A the
 * daily pair first; then the four tiles, two by two (one per line at
 * accessibility sizes); then one row, "Quizzes and tools", to the Explore
 * hub. Every push stays inside Today.
 */
export function MoreToExplore({
  pair = null,
}: {
  /** Case A: the daily pair, drawn here under the header. */
  pair?: ReactNode;
}) {
  return (
    <View testID="today-explore" style={styles.section}>
      <SectionHeader title="More to explore" testID="today-explore-title" />
      <View style={styles.body}>
        {pair}
        <TileGrid testID="today-explore-tiles">
          {exploreTiles.map((tile) => (
            <Tile key={tile.testID} {...tile} />
          ))}
        </TileGrid>
      </View>
      <InsetGroup>
        <LinkRow
          title="Quizzes and tools"
          symbol={symbols.explore}
          symbolInk="votes"
          href={exploreRoute}
          testID="today-explore-open"
        />
      </InsetGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: rhythm.heading },
  // 16 pt between the pair and the grid; 12 pt from the grid to the row.
  body: { gap: rhythm.block, marginBottom: rhythm.line },
});
