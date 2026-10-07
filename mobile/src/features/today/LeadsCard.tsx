import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Text } from '../../design/primitives';
import { light, spacing } from '../../design/tokens';
import { leadsRoute } from '../../navigation/routes';
import { TintIcon, TodayCard, useTodayInk } from './parts';
import { mix } from './tint';

/**
 * The way into Leads, on navy with the bronze mark colour. Static: the
 * Leads screen loads its export when it opens.
 */
export function LeadsCard() {
  // The mark colour as text: 7:1 on navy under Increase Contrast.
  const mark = useTodayInk(light.bronzeBright, light.navyRaised);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Leads. Where recorded contract value or party receipts concentrate, and companies that appear in both. Each lead keeps its caveats; a lead is not a finding."
      accessibilityHint="Opens all leads"
      testID="today-leads-open"
      onPress={() => router.push(leadsRoute)}
    >
      {({ pressed }) => (
        <TodayCard
          ground={pressed ? light.navyRaised : light.navy}
          style={styles.card}
        >
          <View style={styles.top}>
            <View style={styles.badge}>
              <TintIcon
                name="point.3.connected.trianglepath.dotted"
                size={18}
                color={mark}
              />
            </View>
            <Text
              wordSafe
              variant="kicker"
              style={[styles.kicker, { color: mark }]}
            >
              LEADS
            </Text>
          </View>
          <Text wordSafe variant="subheading" tone="onNavy">
            Government contracts, party funding, companies in both
          </Text>
          <Text wordSafe variant="metadata" tone="onNavySoft">
            Where recorded contract value or party receipts concentrate, and
            companies that appear in both. Each lead keeps its caveats; a lead
            is not a finding.
          </Text>
          <View style={styles.action}>
            <Text wordSafe variant="control" tone="onNavy" style={styles.grow}>
              All leads
            </Text>
            <Icon name="arrow.right" size={16} tone="onNavy" />
          </View>
        </TodayCard>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.s4,
    gap: spacing.s3,
    borderColor: light.navy,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mix(light.navy, light.bronzeBright, 0.18),
  },
  kicker: { letterSpacing: 1 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s2,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: mix(light.navy, light.onNavySoft, 0.3),
  },
  grow: { flex: 1 },
});
