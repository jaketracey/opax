import { StyleSheet, View } from 'react-native';
import { Card } from '../../design/card';
import { formatDate } from '../../design/format';
import { Icon } from '../../design/icon';
import { Divider } from '../../design/controls';
import { PartyLabel } from '../../design/people';
import { ValueRow } from '../../design/rows';
import { SourceLine, type SourceDetails } from '../../design/source';
import { Skeleton } from '../../design/states';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, hairline, radii, rhythm } from '../../design/tokens';
import { presentSource } from '../../navigation/sheets';
import { electorateRoute } from '../../navigation/routes';
import { hasOutline, OutlineMap } from '../electorate-map/OutlineMap';
import {
  censusHeadline,
  latestElection,
  newestCensus,
} from './election-summary';
import type { ElectorateView } from './model';
import type { Electorate } from '../../api/catalogs';

/** The card's sources: AEC and ABS as separate originals, each with its date. */
export function electorateCardSource(
  seat: Pick<Electorate, 'representation_as_of'>,
  view: ElectorateView,
): SourceDetails & { title: string } {
  const census = view.census.find((b) => b.data) ?? null;
  const election = view.elections
    .filter((b) => b.data)
    .sort((a, b) => (b.asAt ?? '').localeCompare(a.asAt ?? ''))[0];
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
    originals: [
      ...(election?.sources ?? []),
      ...(census?.sources ?? []),
    ]
      .filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i)
      .map((s) => ({ label: s.label, url: s.url })),
    notes: census
      ? [
          `Census figures are for the electorate's boundaries at the ${census.data!.year} Census. Not adjusted for boundary changes since the Census.`,
        ]
      : [],
  };
}

export function ElectorateCardSkeleton() {
  return (
    <Skeleton shape="card" count={1} label="Loading your electorate" />
  );
}

/**
 * "Your electorate": the outline, the Census with its year, the newest
 * election, and the card's own source line at its foot, which is its own
 * accessibility element. The whole card opens the electorate page.
 */
export function ElectorateCard({
  seat,
  view,
}: {
  seat: Electorate;
  view: ElectorateView;
}) {
  const census = censusHeadline(newestCensus(view));
  const election = latestElection(view, seat.jurisdiction);
  const outline = hasOutline(view.boundaries);
  const source = electorateCardSource(seat, view);
  const label = [
    seat.name,
    census
      ? `${census.label}: ${census.rows.map((r) => `${r.label} ${r.value}`).join(', ')}`
      : null,
    election
      ? `${election.title}: ${election.winner?.name ?? ''}${election.winner?.party ? `, ${election.winner.party}` : ''}, ${formatDate(election.date)}`
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
        <View style={styles.body}>
          {!census && !election ? (
            <Text variant="subsectionTitle">{seat.name}</Text>
          ) : null}
          {census ? (
            <View style={styles.block}>
              <Text variant="subsectionTitle">{census.label}</Text>
              {census.rows.map((row) => (
                <ValueRow key={row.key} label={row.label} value={row.value} />
              ))}
            </View>
          ) : null}
          {census && election ? <Divider /> : null}
          {election ? (
            <View style={styles.election}>
              <View style={styles.block}>
                <Text variant="subsectionTitle">{election.title}</Text>
                {election.winner ? (
                  <>
                    <Text wordSafe>{election.winner.name}</Text>
                    <PartyLabel
                      party={election.winner.party}
                      linked={false}
                      nested
                    />
                  </>
                ) : null}
                <Text variant="secondary">{formatDate(election.date, 'short')}</Text>
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
  top: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  body: { padding: rhythm.block, gap: rhythm.tight },
  block: { gap: rhythm.line },
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
    borderTopColor: colors.line,
    marginTop: -1,
    paddingHorizontal: rhythm.block,
    paddingBottom: rhythm.tight,
  },
});
