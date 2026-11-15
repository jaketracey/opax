import { Platform, StyleSheet, View } from 'react-native';
import { PlainPressable as Pressable } from '../../design/pressable';
import { Icon } from '../../design/icon';
import { symbols } from '../../design/symbols';
import { Text } from '../../design/text';
import { colors, minimumTarget, rhythm } from '../../design/tokens';

export const billScopeCopy = {
  placeholder: 'Ask about this bill',
  line: 'Answers come from this bill’s records and are machine-written.',
  key: 'Bill',
} as const;

/**
 * Ask opened from a bill, with nothing asked yet: one line and nothing to
 * choose from. No conversations and no starters; the bill is named in the
 * composer's chip, and the composer is the only way in.
 */
export function AskBillIdle() {
  return (
    <View testID="ask-bill-idle">
      <Text wordSafe variant="secondary" testID="ask-bill-idle-line">
        {billScopeCopy.line}
      </Text>
    </View>
  );
}

/**
 * The bill an Ask is scoped to, in the composer above the field: its short
 * title in full (it wraps, never clips or shortens) and an × that ends the
 * scope, which returns Ask to every record.
 */
export function BillScopeChip({
  name,
  disabled = false,
  onClear,
}: {
  name: string;
  /** While an answer is being written the scope cannot change. */
  disabled?: boolean;
  onClear: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.chip} testID="ask-bill-chip">
        <View
          accessible
          accessibilityLabel={`${billScopeCopy.key}, ${name}`}
          style={styles.name}
          testID="ask-bill-chip-name"
        >
          <Text wordSafe variant="footnote">
            {name}
          </Text>
        </View>
        <Pressable
          feedback="wash"
          accessibilityRole="button"
          accessibilityLabel={`Remove ${billScopeCopy.key}, ${name}`}
          accessibilityHint="Asks about every record again"
          accessibilityState={disabled ? { disabled: true } : undefined}
          disabled={disabled}
          onPress={onClear}
          android_ripple={{ color: colors.dividerSubtle }}
          style={styles.clear}
          testID="ask-bill-chip-clear"
        >
          <Icon name={symbols.close} size={15} tone="inkSoft" maxScale={1.5} />
        </Pressable>
      </View>
    </View>
  );
}

const target = Platform.OS === 'android' ? 48 : minimumTarget;
const styles = StyleSheet.create({
  // The chip is as wide as its title and never wider than the composer.
  row: {
    flexDirection: 'row',
    paddingLeft: rhythm.tight,
    paddingRight: rhythm.tight,
    paddingTop: rhythm.tight,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: colors.sunken,
  },
  name: {
    flexShrink: 1,
    paddingLeft: rhythm.line,
    paddingVertical: rhythm.tight,
  },
  clear: {
    minWidth: target,
    minHeight: target,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
