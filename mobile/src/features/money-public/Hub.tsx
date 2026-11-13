import { RouteOptions } from '../../navigation/preview';
import { useTitleOnScroll } from '../../navigation/useTitleOnScroll';

import { useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLayout } from '../../design/adaptive';
import { InsetGroup, Screen } from '../../design/layout';
import { LinkRow } from '../../design/rows';
import { Heading } from '../../design/text';
import { rhythm } from '../../design/tokens';
import {
  connectionsRoute,
  leadsRoute,
  grantsAllocationRoute,
  grantsRoute,
  largestGrantsRoute,
} from '../../navigation/routes/public-money';
import { savedSeatDirectory, useSeat } from '../your-mp/useSeat';
import { ContractsCard, GrantsCard, PartiesCard } from './HubCards';
import { moneyBar } from './parts';

/** The reader's saved House seat, by name and state, or null. */
function useSavedSeat() {
  const seat = useSeat();
  if (seat.status !== 'chosen' || !seat.choice.seatId) return null;
  const electorate = savedSeatDirectory()?.electorates.data.electorates.find(
    (e) =>
      e.electorate_id === seat.choice.seatId &&
      e.jurisdiction === 'federal' &&
      e.chamber === 'representatives',
  );
  return electorate
    ? { name: electorate.name, state: electorate.state_code }
    : null;
}

/**
 * Public money (specs/money.md 2.1, journeys/money.md 4.3 and 12): three
 * question cards in the order grants, contracts, parties, each with its
 * destination's name as a kicker and one dated figure, then one group of
 * rows with no header. No Share until the web has a hub page; no "Money
 * map" row (the parties card opens it).
 */
export default function Hub() {
  const seat = useSavedSeat();
  const { regular } = useLayout();
  // The bar title fades in by scroll with no width at rest, so the back
  // button keeps its label (money-03), and truncates inside the bar items.
  const barTitleRef = useRef<View>(null);
  const barTitle = useTitleOnScroll(barTitleRef, 'Public money');
  return (
    <>
      <RouteOptions
        options={moneyBar({
          name: 'Public money',
          path: '/money',
          share: false,
        })}
      />
      <Screen
        grouped
        onScroll={barTitle.onScroll}
        column={regular ? 'wide' : 'readable'}
        testID="money-hub"
      >
        <View
          ref={barTitleRef}
          collapsable={false}
          onLayout={barTitle.onTitleLayout}
        >
          <Heading level={1} kind="page" testID="money-hub-title">
            Public money
          </Heading>
        </View>
        <HubCardRow />
        <InsetGroup testID="money-hub-more">
          {seat ? (
            <LinkRow
              title={`Grants in ${seat.name}`}
              testID="money-seat"
              href={grantsRoute({
                jur: 'federal',
                seat: seat.name,
                state: seat.state,
              })}
            />
          ) : null}
          <LinkRow
            title="Leads"
            detail="Names that appear in both money and the record"
            testID="money-leads"
            href={leadsRoute}
          />
          <LinkRow
            title="Largest grants"
            detail="The biggest new grant agreements each month"
            testID="money-largest"
            href={largestGrantsRoute()}
          />
          <LinkRow
            title="Queensland grants"
            testID="money-qld"
            href={grantsRoute({ jur: 'qld' })}
          />
          <LinkRow
            title="Community funding"
            detail="Election commitment grants, by project and state"
            testID="money-allocation"
            href={grantsAllocationRoute}
          />
          <LinkRow
            title="Programs and places"
            detail="Where programs and places are named together"
            testID="money-connections"
            href={connectionsRoute}
          />
        </InsetGroup>
      </Screen>
    </>
  );
}

/** Narrowest a question card may be beside the others, at default text. */
const CARD_MIN_WIDTH = 240;

/**
 * The three question cards, side by side only where each keeps a card's
 * width (scaled with the text size, as `Grid` scales its cells). Read inside
 * the screen's column: a regular region as narrow as 560pt (a 669pt Duo
 * unfolded in portrait) left three 190pt cards, so they stack there.
 */
function HubCardRow() {
  const { regular, width } = useLayout();
  const { fontScale } = useWindowDimensions();
  const min = CARD_MIN_WIDTH * Math.min(Math.max(fontScale, 1), 2);
  const across = regular && width >= min * 3 + rhythm.block * 2;
  return (
    <View
      testID="money-hub-cards"
      style={[styles.cards, across ? styles.across : null]}
    >
      <View style={across ? styles.third : null}>
        <GrantsCard />
      </View>
      <View style={across ? styles.third : null}>
        <ContractsCard />
      </View>
      <View style={across ? styles.third : null}>
        <PartiesCard />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cards: { gap: rhythm.block },
  across: { flexDirection: 'row', alignItems: 'stretch' },
  third: { flex: 1, minWidth: 0 },
});
