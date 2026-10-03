import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  View,
  type TextProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';
import { colors, minimumTarget, radius, spacing, textStyles } from './tokens';
export function Text({
  variant = 'body',
  style,
  ...props
}: TextProps & { variant?: keyof typeof textStyles }) {
  const { dynamicTypeRamp, ...type } = textStyles[variant];
  return (
    <NativeText
      {...props}
      allowFontScaling
      maxFontSizeMultiplier={0}
      dynamicTypeRamp={dynamicTypeRamp}
      style={[{ color: colors.ink, flexShrink: 1 }, type, style]}
    />
  );
}
export function Button({
  label,
  variant = 'default',
  onPress,
  disabled,
  testID,
}: {
  label: string;
  variant?: 'primary' | 'default' | 'quiet';
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary'
          ? styles.primary
          : variant === 'default'
            ? styles.outlined
            : null,
        { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text
        style={{ color: variant === 'primary' ? colors.raised : colors.navy }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function Divider({ subtle = false }: { subtle?: boolean }) {
  return (
    <View
      accessible={false}
      style={{
        height: 1,
        backgroundColor: subtle ? colors.dividerSubtle : colors.dividerDefault,
      }}
    />
  );
}
export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text variant="tag" style={{ color: colors.bronzeInk }}>
        {label}
      </Text>
    </View>
  );
}
export function PartyLabel({
  party,
  testID,
}: {
  party: string | null;
  testID?: string;
}) {
  const name = party ?? 'Party not recorded';
  const color = /labor|labour/i.test(name)
    ? colors.partyLabor
    : /lnp/i.test(name)
      ? colors.partyLnp
      : /liberal/i.test(name)
        ? colors.partyLiberal
        : /national|clp/i.test(name)
          ? colors.partyNationals
          : /green/i.test(name)
            ? colors.partyGreens
            : /one nation/i.test(name)
              ? colors.partyOneNation
              : /independent/i.test(name)
                ? colors.partyIndependent
                : colors.partyOther;
  return (
    <View style={styles.party}>
      <View
        accessible={false}
        style={[styles.dot, { backgroundColor: color }]}
      />
      <Text testID={testID}>{name}</Text>
    </View>
  );
}
export function Screen({
  title,
  testID,
  children,
}: {
  title: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        testID={testID}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      >
        <Text
          variant="title"
          accessibilityRole="header"
          testID={testID ? `${testID}-title` : undefined}
        >
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Group({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ gap: spacing.s4 }, style]} />;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: 20,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s7,
    gap: spacing.s5,
  },
  button: {
    minHeight: 48,
    minWidth: minimumTarget,
    borderRadius: radius,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: colors.navy },
  outlined: { borderWidth: 1, borderColor: colors.lineStrong },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius,
    backgroundColor: colors.bronzeWash,
    padding: spacing.s3,
  },
  party: { flexDirection: 'row', gap: spacing.s3, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
