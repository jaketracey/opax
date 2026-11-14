import { router } from 'expo-router';
import { welcomeBasicsRoute } from '../../navigation/routes';
import { lessonCopy } from '../newcomer/lessons';
import { newcomerOption } from '../newcomer/option';
import { plainWordsRoute } from '../newcomer/TermTip';
import { plainWordsCopy } from '../newcomer/terms';
import { useLayout } from '../../design/adaptive';
import { SurfaceGrid } from './SurfaceGrid';
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
  const { regular } = useLayout();
  const Tiles = regular ? SurfaceGrid : TileGrid;
  return (
    <View testID="today-explore" style={styles.section}>
      <SectionHeader
        compact
        title="More to explore"
        testID="today-explore-title"
      />
      <View style={styles.body}>
        {pair}
        <Tiles testID="today-explore-tiles">
          {exploreTiles.map((tile) => (
            <Tile key={tile.testID} {...tile} />
          ))}
        </Tiles>
      </View>
      <InsetGroup>
        {newcomerOption() === 'c' ? (
          <LinkRow
            title={lessonCopy.pageTitle}
            symbol={symbols.yourMP}
            onPress={() => router.push(welcomeBasicsRoute)}
            testID="today-explore-basics"
          />
        ) : null}
        {newcomerOption() ? (
          <LinkRow
            title={plainWordsCopy.title}
            detail={plainWordsCopy.lead}
            symbol={symbols.help}
            onPress={() => router.push(plainWordsRoute())}
            testID="today-explore-plain-words"
          />
        ) : null}
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
