import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { recentBillsFor } from '../../api/selectors';
import { billSentenceCase } from '../../api/bill-transforms';
import { formatDate } from '../../design/format';
import { partyDot } from '../../design/party';
import { Text, useAccessibilitySize } from '../../design/primitives';
import { layout, light, spacing } from '../../design/tokens';
import { billRoute } from '../../navigation/routes';
import { Chip, TodayCard, shortDay } from './parts';
import { billAccent } from './tint';

type Bill = NonNullable<ReturnType<typeof recentBillsFor>['data']>[number];

const CARD_WIDTH = 268;
const GAP = spacing.s3 + spacing.s1;

/** What a bill card says, visibly and to VoiceOver (one element). */
export function billCardText(bill: Bill) {
  const status = billSentenceCase(bill.status) || 'Status not recorded';
  const by =
    bill.portfolio ??
    ([bill.sponsor, bill.sponsor_party].filter(Boolean).join(' · ') || null);
  return {
    status,
    by,
    introduced: bill.introduced
      ? `${bill.introducedLabel} ${shortDay(bill.introduced)}`
      : null,
    label: [
      bill.title,
      status,
      bill.introduced
        ? `${bill.introducedLabel} ${formatDate(bill.introduced)}`
        : null,
      bill.portfolio ? `${bill.portfolio} portfolio` : null,
      bill.sponsor,
      bill.sponsor_party,
    ]
      .filter(Boolean)
      .join(', '),
  };
}

function BillCard({
  bill,
  index,
  fill,
}: {
  bill: Bill;
  index: number;
  fill: boolean;
}) {
  const text = billCardText(bill);
  const tone = billAccent(bill.status);
  const dot = !bill.portfolio ? partyDot(bill.sponsor_party) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text.label}
      accessibilityHint="Opens the bill"
      testID={`today-bill-${index}`}
      onPress={() => router.push(billRoute(bill.key))}
      style={fill ? null : styles.slot}
    >
      {({ pressed }) => (
        <TodayCard
          ground={pressed ? light.sunken : undefined}
          style={styles.card}
        >
          <View style={[styles.band, { backgroundColor: tone.base }]} />
          <View style={styles.inner}>
            <Chip
              label={text.status}
              ground={tone.wash}
              color={tone.ink}
              dot={tone.base}
            />
            <Text variant="strong" style={styles.title}>
              {bill.title}
            </Text>
            <View style={styles.foot}>
              {text.by ? (
                <View style={styles.by}>
                  {dot ? (
                    <View style={[styles.dot, { backgroundColor: dot }]} />
                  ) : null}
                  <Text wordSafe variant="metadata" style={styles.byText}>
                    {text.by}
                  </Text>
                </View>
              ) : null}
              {text.introduced ? (
                <Text wordSafe variant="fine">
                  {text.introduced}
                </Text>
              ) : null}
            </View>
          </View>
        </TodayCard>
      )}
    </Pressable>
  );
}

/**
 * Recently introduced bills as a carousel of cards in status colour; one
 * card per row at accessibility sizes, where a swipe would hide most of it.
 */
export function BillCarousel({ bills }: { bills: Bill[] }) {
  const stacked = useAccessibilitySize();
  if (stacked)
    return (
      <View style={styles.stack}>
        {bills.map((bill, i) => (
          <BillCard key={bill.key} bill={bill} index={i} fill />
        ))}
      </View>
    );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + GAP}
      snapToAlignment="start"
      style={styles.rail}
      contentContainerStyle={styles.railContent}
      testID="today-bills-rail"
    >
      {bills.map((bill, i) => (
        <BillCard key={bill.key} bill={bill} index={i} fill={false} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: { marginHorizontal: -layout.screenMargin },
  railContent: {
    paddingHorizontal: layout.screenMargin,
    gap: GAP,
  },
  slot: { width: CARD_WIDTH },
  stack: { gap: spacing.s3 },
  card: { flexGrow: 1 },
  band: { height: 4 },
  inner: {
    flexGrow: 1,
    padding: spacing.s4,
    paddingTop: spacing.s3 + spacing.s1,
    gap: spacing.s3,
  },
  foot: { gap: 2 },
  title: { flexGrow: 1 },
  by: { flexDirection: 'row', alignItems: 'center', gap: spacing.s2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  byText: { flexShrink: 1 },
});
