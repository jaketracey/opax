import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'expo-symbols';
import { IconButton } from '../../design/primitives';
import { spacing } from '../../design/tokens';

type Look = 'plain' | 'on' | 'danger' | 'disabled';

/**
 * @deprecated Use `IconButton` (`size="large"`, `variant="danger"`,
 * `selected`). A round, icon-only call control, like the Phone app's: the
 * symbol keeps its size at every text size, and a long press shows the
 * Large Content Viewer, which carries the label.
 */
export function RoundButton({
  symbol,
  label,
  onPress,
  look = 'plain',
  size = 'large',
  selected,
  disabled = false,
  badge,
  testID,
}: {
  symbol: SFSymbol;
  label: string;
  onPress: () => void;
  look?: Look;
  size?: 'large' | 'small' | 'bar';
  selected?: boolean;
  disabled?: boolean;
  badge?: number;
  testID?: string;
}) {
  return (
    <IconButton
      symbol={symbol}
      accessibilityLabel={label}
      onPress={onPress}
      variant={look === 'danger' ? 'danger' : 'default'}
      size={size === 'bar' ? 'default' : 'large'}
      selected={look === 'on' ? true : selected}
      disabled={disabled || look === 'disabled'}
      badge={badge}
      testID={testID}
    />
  );
}

/** One row of controls, centred; spacing grows with the controls. */
export function ControlRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s5,
  },
});
