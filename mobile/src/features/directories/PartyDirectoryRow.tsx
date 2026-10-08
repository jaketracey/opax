import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, PartyChip, Text } from '../../design/primitives';
import { colors, minimumTarget, rhythm } from '../../design/tokens';
import { formatCount, formatDate, formatMoney } from '../../design/format';
import { billFoldText } from '../../api/bill-transforms';
import { partyRoute } from '../../navigation/routes';
import type { PartyRow } from './model';

const commissions: Record<string, string> = {
  federal: 'Federal',
  qld: 'Queensland',
  vic: 'Victoria',
};
export function PartyDirectoryRow({ item }: { item: PartyRow }) {
  const detail = `${formatCount(item.speeches)} speeches · ${formatCount(item.members)} roster members`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        item.name,
        detail,
        ...Object.entries(item.money).map(
          ([jur, m]) =>
            `${commissions[jur]}, ${formatMoney(m.total)}, updated ${formatDate(m.asAt)}`,
        ),
      ].join(', ')}
      testID={`directory-party-${billFoldText(item.name).replace(/ /g, '-')}`}
      onPress={() => router.push(partyRoute(item.name))}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.sunken },
      ]}
    >
      <View style={styles.body}>
        <View style={styles.party}>
          <PartyChip party={item.name} status="unknown" short={false} nested />
        </View>
        <Text variant="metadata" wordSafe>
          {detail}
        </Text>
        {Object.entries(item.money).map(([jur, money]) => (
          <View key={jur} style={styles.receipt}>
            <Text variant="metadata" tone="moneyInk" wordSafe>
              {commissions[jur]} · {formatMoney(money.total)}
            </Text>
          </View>
        ))}
      </View>
      <Icon name="chevron.right" size={13} tone="inkSoft" />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
    minHeight: minimumTarget,
    paddingVertical: rhythm.heading,
  },
  body: { flex: 1, gap: rhythm.tight },
  party: { flexDirection: 'row' },
  receipt: { gap: rhythm.line },
});
