import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Hoverable,
  Icon,
  PartyChip,
  Text,
  useHover,
} from '../../design/primitives';
import {
  SelectedMark,
  selectedWash,
  splitRowStyles,
} from '../../design/selection';
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
export function PartyDirectoryRow({
  item,
  selected,
  onPress,
}: {
  item: PartyRow;
  /** iPad split: whether this party is in the detail pane (see LinkRow). */
  selected?: boolean;
  onPress?: () => void;
}) {
  const inSplit = selected !== undefined;
  const [hovered, onHover] = useHover();
  const detail = `${formatCount(item.speeches)} speeches · ${formatCount(item.members)} roster members`;
  const row = (
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
      accessibilityState={inSplit ? { selected } : undefined}
      testID={`directory-party-${billFoldText(item.name).replace(/ /g, '-')}`}
      onPress={onPress ?? (() => router.push(partyRoute(item.name)))}
      style={({ pressed }) => [
        styles.row,
        inSplit ? splitRowStyles.bleed : null,
        selected
          ? selectedWash('people')
          : (pressed || (inSplit && hovered)) && {
              backgroundColor: colors.sunken,
            },
      ]}
    >
      {selected ? <SelectedMark accent="people" /> : null}
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
      {inSplit ? null : <Icon name="chevron.right" size={13} tone="inkSoft" />}
    </Pressable>
  );
  // Pointer hover only in a split list; the phone keeps its view tree.
  return inSplit ? (
    <Hoverable effect="none" onHover={onHover}>
      {row}
    </Hoverable>
  ) : (
    row
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
