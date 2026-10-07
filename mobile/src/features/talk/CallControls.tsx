import type { ReactNode } from 'react';
import { Text as NativeText, Pressable, StyleSheet, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { fonts, light, spacing } from '../../design/tokens';

type Look = 'plain' | 'on' | 'danger' | 'disabled';
const looks: Record<
  Look,
  { fill: string; pressed: string; border: string; icon: string }
> = {
  plain: {
    fill: light.raised,
    pressed: light.sunken,
    border: light.line,
    icon: light.navy,
  },
  on: {
    fill: light.navy,
    pressed: light.navyRaised,
    border: light.navy,
    icon: light.onNavy,
  },
  danger: {
    fill: light.danger,
    pressed: '#86191F',
    border: light.danger,
    icon: light.onNavy,
  },
  // Opaque role colours, never opacity, as for every disabled control.
  disabled: {
    fill: light.sunken,
    pressed: light.sunken,
    border: light.lineStrong,
    icon: light.inkSoft,
  },
};
// Large for the call itself, small beside it, bar for the record view's bar.
const diameters = { large: 72, small: 54, bar: 44 } as const;

/**
 * A round, icon-only call control, like the Phone app's. The icon keeps its
 * size at every text size (the circle is already larger than a 44pt target);
 * a long press shows the Large Content Viewer, which carries the label.
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
  size?: keyof typeof diameters;
  selected?: boolean;
  disabled?: boolean;
  badge?: number;
  testID?: string;
}) {
  const d = diameters[size];
  const style = looks[disabled ? 'disabled' : look];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled,
        ...(selected === undefined ? {} : { selected }),
      }}
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={size === 'large' ? 0 : 6}
      style={({ pressed }) => [
        styles.round,
        {
          width: d,
          height: d,
          borderRadius: d / 2,
          backgroundColor: pressed ? style.pressed : style.fill,
          borderColor: style.border,
        },
      ]}
    >
      <SymbolView
        name={symbol}
        size={size === 'large' ? 28 : size === 'small' ? 22 : 18}
        tintColor={style.icon}
        weight="medium"
        style={{ width: d * 0.5, height: d * 0.5 }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          {/* The count is in the label; the badge keeps its size. */}
          <NativeText allowFontScaling={false} style={styles.badgeText}>
            {String(badge)}
          </NativeText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** One row of controls, centred; spacing grows with the controls. */
export function ControlRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s5,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: light.bronzeInk,
  },
  badgeText: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 13,
    lineHeight: 16,
    color: light.onNavy,
    fontVariant: ['tabular-nums'],
  },
});
