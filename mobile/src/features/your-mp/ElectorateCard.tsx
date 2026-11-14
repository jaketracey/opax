import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { Electorate } from '../../api/catalogs';
import { SurfaceGrid } from '../today/SurfaceGrid';
import { Card } from '../../design/card';
import { Divider } from '../../design/controls';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { PARTY_NOT_RECORDED, isPartyLabel } from '../../design/party';
import { PartyLabel } from '../../design/people';
import { ValueRow } from '../../design/rows';
import { RecordNameLink } from '../../design/record';
import { SourceLine, type SourceDetails } from '../../design/source';
import { Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import {
  colors,
  hairline,
  minimumTarget,
  radii,
  rhythm,
} from '../../design/tokens';
import {
  electorateRoute,
  personRoute,
  partyRoute,
} from '../../navigation/routes';
import { presentSource } from '../../navigation/sheets';
import { hasOutline, OutlineMap } from '../electorate-map/OutlineMap';
import {
  censusHeadline,
  electionsNewestFirst,
  latestElection,
  newestCensus,
} from './election-summary';
import {
  representativeProfile,
  type Directory,
  type ElectorateView,
} from './model';

/** The card's sources: AEC and ABS as separate originals, each with its date. */
export function electorateCardSource(
  seat: Pick<Electorate, 'representation_as_of'>,
  view: ElectorateView,
): SourceDetails & { title: string } {
  const censusRecord = newestCensus(view);
  const census = censusRecord
    ? view.census.find((b) => b.data === censusRecord)
    : null;
  const electionRecord = electionsNewestFirst(
    view.elections.flatMap((b) => (b.data ? [b.data] : [])),
  )[0];
  const election = electionRecord
    ? view.elections.find((b) => b.data === electionRecord)
    : null;
  const aecDate = election?.asAt ?? seat.representation_as_of ?? null;
  return {
    title: 'About your electorate',
    asOf: aecDate,
    citation: [
      { label: 'AEC', title: 'Australian Electoral Commission', asOf: aecDate },
      ...(census
        ? [
            {
              label: 'ABS',
              title: `ABS Census ${census.data!.year}`,
              asOf: census.asAt,
            },
          ]
        : []),
    ],
    originals: [...(election?.sources ?? []), ...(census?.sources ?? [])]
      .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i)
      .map((s) => ({ label: s.label, url: s.url })),
    notes: census
      ? [
          `Census figures are for the electorate’s boundaries at the ${census.data!.year} Census. Not adjusted for boundary changes since the Census.`,
        ]
      : [],
  };
}

export function ElectorateCardSkeleton() {
  return <Skeleton shape="card" count={1} label="Loading your electorate" />;
}

/**
 * "Your electorate": the outline, the Census with its year, the newest
 * election, and the card's own source line at its foot, which is its own
 * accessibility element. The whole card opens the electorate page.
 */
export function ElectorateCard({
  seat,
  view,
  directory,
}: {
  seat: Electorate;
  view: ElectorateView;
  directory?: Directory;
}) {
  const census = censusHeadline(newestCensus(view));
  const election = latestElection(view, seat.jurisdiction);
  const winner = election?.winner;
  const winnerProfile =
    winner?.personId && directory
      ? representativeProfile(winner.personId, directory)
      : null;
  const winnerHref = winnerProfile
    ? personRoute(winnerProfile.slug, winner!.name)
    : undefined;
  const outline = hasOutline(view.boundaries);
  const source = electorateCardSource(seat, view);
  const label = [
    seat.name,
    census
      ? `${census.label}: ${census.rows.map((r) => `${r.label} ${r.value}`).join(', ')}`
      : null,
    election
      ? `${election.title}: ${election.winner ? `${election.winner.name}, ${election.winner.party ?? PARTY_NOT_RECORDED}, ` : ''}${formatDate(election.date)}`
      : null,
  ]
    .filter(Boolean)
    .join('. ');
  return (
    <View testID="your-electorate-card" style={styles.wrap}>
      <Card
        href={electorateRoute(seat.electorate_id)}
        padded={false}
        accessibilityRole="link"
        accessibilityLabel={label}
        accessibilityHint="Opens the electorate"
        style={styles.top}
        accessibilityActions={[
          ...(winnerHref
            ? [
                {
                  name: 'winner',
                  label: `Open ${winner!.name}`,
                  onAction: () => router.push(winnerHref),
                },
              ]
            : []),
          ...(isPartyLabel(winner?.party)
            ? [
                {
                  name: 'party',
                  label: `Open ${winner!.party} party page`,
                  onAction: () => router.push(partyRoute(winner!.party!)),
                },
              ]
            : []),
          {
            name: 'sources',
            label: 'Sources',
            onAction: () =>
              presentSource(source, { testID: 'your-electorate-source' }),
          },
        ]}
        testID="your-electorate"
      >
        {outline ? (
          <OutlineMap
            boundaries={view.boundaries}
            name={seat.name}
            state={seat.state_code}
            variant="thumb"
            ground="raised"
          />
        ) : null}
        <View style={[styles.body, outline ? styles.afterOutline : null]}>
          {!census && !election ? (
            <Text variant="subsectionTitle">{seat.name}</Text>
          ) : null}
          {census ? (
            <View style={styles.block}>
              <Text variant="subsectionTitle">{census.label}</Text>
              <SurfaceGrid testID="your-mp-stats-grid" minItemWidth={120}>
                {census.rows.map((row) => (
                  <ValueRow key={row.key} label={row.label} value={row.value} />
                ))}
              </SurfaceGrid>
            </View>
          ) : null}
          {census && election ? <Divider /> : null}
          {election ? (
            <View style={styles.election}>
              <View style={[styles.block, styles.electionText]}>
                <Text variant="subsectionTitle">{election.title}</Text>
                {election.winner ? (
                  <>
                    <RecordNameLink
                      name={election.winner.name}
                      href={winnerHref}
                      testID="your-electorate-winner"
                    />
                    <View style={styles.party}>
                      <PartyLabel
                        party={election.winner.party}
                        linked
                        nested
                        compact
                      />
                    </View>
                  </>
                ) : null}
                <Text variant="secondary">
                  {formatDate(election.date, 'short')}
                </Text>
              </View>
              <Icon
                name={symbols.chevron}
                size={13}
                maxScale={1.5}
                tone="inkSoft"
              />
            </View>
          ) : (
            <View style={styles.chevronOnly}>
              <Icon
                name={symbols.chevron}
                size={13}
                maxScale={1.5}
                tone="inkSoft"
              />
            </View>
          )}
        </View>
      </Card>
      {/* Inside the card's frame, after a hairline, but its own element. */}
      <View style={styles.foot}>
        <SourceLine {...source} testID="your-electorate-source" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  top: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderCurve: 'continuous',
  },
  body: { padding: rhythm.block, gap: rhythm.tight },
  // The outline already has an inset below its drawing.
  afterOutline: { paddingTop: 0 },
  block: { gap: rhythm.line },
  electionText: { flex: 1 },
  party: { minHeight: minimumTarget },
  election: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: rhythm.tight,
  },
  chevronOnly: { alignItems: 'flex-end' },
  // The card's foot: same surface, after an inset hairline, so the line sits
  // inside the card while staying its own element (not in the card's link).
  foot: {
    backgroundColor: colors.raised,
    borderBottomLeftRadius: radii.container,
    borderBottomRightRadius: radii.container,
    borderCurve: 'continuous',
    borderTopWidth: hairline,
    borderTopColor: colors.dividerSubtle,
    marginTop: -1,
    paddingHorizontal: rhythm.block,
    paddingBottom: rhythm.tight,
  },
});
