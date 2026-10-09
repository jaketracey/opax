import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Hoverable, Icon, Text, Card } from '../../design/primitives';
import { colors, radii, spacing } from '../../design/tokens';
import { leadsRoute } from '../../navigation/routes';
import { TintIcon } from './parts';

/**
 * The way into Leads, on navy with the bronze mark colour. Static: the
 * Leads screen loads its export when it opens.
 */
export function LeadsCard() {
  return (
    <Hoverable effect="lift" cornerRadius={radii.md}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Leads. Where recorded contract value or party receipts concentrate, and companies that appear in both. Each lead keeps its caveats; a lead is not a finding."
        accessibilityHint="Opens all leads"
        testID="today-leads-open"
        onPress={() => router.push(leadsRoute)}
      >
        {({ pressed }) => (
          <Card
            padded={false}
            ground={pressed ? colors.navyRaised : colors.navy}
            style={styles.card}
          >
            <View style={styles.top}>
              <View style={styles.badge}>
                <TintIcon
                  name="point.3.connected.trianglepath.dotted"
                  size={18}
                  color={colors.bronzeBright}
                />
              </View>
              <Text wordSafe variant="label" tone="onNavySoft">
                Leads
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
              <Text
                wordSafe
                variant="control"
                tone="onNavy"
                style={styles.grow}
              >
                All leads
              </Text>
              <Icon name="arrow.right" size={16} tone="onNavy" />
            </View>
          </Card>
        )}
      </Pressable>
    </Hoverable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.s4,
    gap: spacing.s3,
    borderColor: colors.navy,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.s3 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navyRaised,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s2,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
    borderTopColor: colors.navyRaised,
  },
  grow: { flex: 1 },
});
