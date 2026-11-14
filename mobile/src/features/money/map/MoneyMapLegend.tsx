import { StyleSheet, View } from 'react-native';
import {
  formatMoneyCompact,
  moneyAccessibilityLabel,
} from '../../../design/format';
import { Text } from '../../../design/primitives';
import { colors, rhythm } from '../../../design/tokens';
import type { MapModel } from './model';
import {
  edgeCapAmount,
  edgeWidth,
  LEGEND_EDGES,
  LEGEND_NODES,
  LEGEND_PUBLIC_EDGES,
  nodeFloorAmount,
  nodeRadius,
  PARTIES,
  PUBLIC_MONEY,
  publicEdgeCapAmount,
  publicEdgeEquivalent,
  publicEdgeWidth,
} from './scales';

/** The $1bn reference disc is drawn this wide, in points; the rest follow. */
const LARGEST = 40;
/** How many parties the legend names in their colours: the largest in view. */
const PARTY_SWATCHES = 6;

/**
 * What the marks mean, with the scales the map uses: area for amounts,
 * width for flows, hue for the donor's industry or the party. Parties are
 * named; the public-money registers are rings, a different measure.
 */
export function MoneyMapLegend({ model }: { model: MapModel }) {
  const discScale =
    LARGEST / 2 / nodeRadius(LEGEND_NODES[LEGEND_NODES.length - 1]!);
  const lineScale = 8 / edgeWidth(LEGEND_EDGES[LEGEND_EDGES.length - 1]!);
  const industries = model.clusters.filter(
    (c) => c.key !== PARTIES && c.key !== PUBLIC_MONEY,
  );
  const floor = formatMoneyCompact(nodeFloorAmount());
  const cap = formatMoneyCompact(edgeCapAmount());
  const publicCap = formatMoneyCompact(publicEdgeCapAmount());
  const equivalent = formatMoneyCompact(publicEdgeEquivalent(1e9));
  const hasPublicMoney = model.clusters.some((c) => c.key === PUBLIC_MONEY);
  // The largest parties in the view, in their own colours.
  const parties = model.nodes
    .filter((n) => n.kind === 'party')
    .sort((a, b) => b.amount - a.amount)
    .slice(0, PARTY_SWATCHES);
  return (
    <View style={styles.legend} testID="money-map-legend">
      <View style={styles.block}>
        <Text wordSafe variant="footnote">
          Disc area is the amount. Discs under {floor} are drawn at the smallest
          size.
        </Text>
        <View
          style={styles.samples}
          accessible
          accessibilityLabel={`Reference discs: ${LEGEND_NODES.map((n) => moneyAccessibilityLabel(n, true)).join(', ')}`}
        >
          {LEGEND_NODES.map((amount) => {
            const size = nodeRadius(amount) * 2 * discScale;
            return (
              <View key={amount} style={styles.sample}>
                <View style={styles.discBox}>
                  <View
                    style={{
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      borderCurve: 'continuous',
                      backgroundColor: colors.inkSoft,
                    }}
                  />
                </View>
                <Text variant="footnote" tabular>
                  {formatMoneyCompact(amount)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.block}>
        <Text wordSafe variant="footnote">
          Line width is the flow. Lines over {cap} are drawn at the widest.
        </Text>
        <View
          style={styles.samples}
          accessible
          accessibilityLabel={`Reference lines: ${LEGEND_EDGES.map((n) => moneyAccessibilityLabel(n, true)).join(', ')}`}
        >
          {LEGEND_EDGES.map((amount) => (
            <View key={amount} style={styles.sample}>
              <View style={styles.lineBox}>
                <View
                  style={{
                    width: 36,
                    height: Math.max(1, edgeWidth(amount) * lineScale),
                    borderRadius: 4,
                    borderCurve: 'continuous',
                    backgroundColor: colors.inkSoft,
                  }}
                />
              </View>
              <Text variant="footnote" tabular>
                {formatMoneyCompact(amount)}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {hasPublicMoney ? (
        <View style={styles.block} testID="money-map-legend-public">
          <Text wordSafe variant="footnote">
            Public money lines are on a lighter scale: $1bn in grants or
            contracts is drawn as wide as {equivalent} in donations, and lines
            over {publicCap} are drawn at the widest.
          </Text>
          <View
            style={styles.samples}
            accessible
            accessibilityLabel={`Reference public money lines: ${LEGEND_PUBLIC_EDGES.map((n) => moneyAccessibilityLabel(n, true)).join(', ')}`}
          >
            {LEGEND_PUBLIC_EDGES.map((amount) => (
              <View key={amount} style={styles.sample}>
                <View style={styles.lineBox}>
                  <View
                    style={{
                      width: 36,
                      height: Math.max(1, publicEdgeWidth(amount) * lineScale),
                      borderRadius: 4,
                      borderCurve: 'continuous',
                      backgroundColor: colors.moneyInk,
                    }}
                  />
                </View>
                <Text variant="footnote" tabular>
                  {formatMoneyCompact(amount)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.block}>
        <Text wordSafe variant="footnote">
          Colour is the donor’s industry, or the party’s own. Parties are named.
          Public money is a ring: a different register, never added to
          donations.
        </Text>
        <View style={styles.swatches} testID="money-map-legend-parties">
          {parties.map((party) => (
            <View
              key={party.id}
              style={styles.swatch}
              accessible
              accessibilityLabel={`${party.label}, party`}
            >
              <View style={[styles.dot, { backgroundColor: party.colour }]} />
              <Text variant="footnote" wordSafe>
                {party.label}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.swatches}>
          {industries.map((cluster) => (
            <View
              key={cluster.key}
              style={styles.swatch}
              accessible
              accessibilityLabel={cluster.label}
            >
              <View style={[styles.dot, { backgroundColor: cluster.colour }]} />
              <Text variant="footnote" wordSafe>
                {cluster.label}
              </Text>
            </View>
          ))}
          <View
            style={styles.swatch}
            accessible
            accessibilityLabel="Public money"
          >
            <View style={styles.ring} />
            <Text variant="footnote">Public money</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { gap: rhythm.block },
  block: { gap: rhythm.tight },
  samples: { flexDirection: 'row', gap: rhythm.block, alignItems: 'flex-end' },
  sample: { alignItems: 'center', gap: rhythm.line },
  discBox: {
    width: LARGEST,
    height: LARGEST,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineBox: { height: 16, justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight },
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.line,
    marginRight: rhythm.tight,
  },
  dot: { width: 10, height: 10, borderRadius: 5, borderCurve: 'continuous' },
  ring: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderCurve: 'continuous',
    borderWidth: 2.5,
    borderColor: colors.moneyInk,
  },
});
