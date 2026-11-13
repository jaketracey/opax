import { symbols } from './symbols';
import { useRef, useState } from 'react';
import {
  Platform,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import type { ButtonProps } from './controls';
import { Icon } from './icon';
import { Pressable } from './pressable';
import { Text } from './text';
import {
  androidControls,
  colors,
  controlHeight,
  interfaceFonts,
} from './tokens';

export function AndroidButton({
  ref,
  label,
  onPress,
  variant = 'default',
  size = 'default',
  icon,
  symbol,
  trailingIcon,
  disabled = false,
  loading = false,
  fullWidth = false,
  hug = false,
  accessibilityLabel,
  accessibilityHint,
  expanded,
  selected,
  on,
  hitSlop,
  testID,
}: ButtonProps) {
  const stacked = useAccessibilitySize();
  const reduceMotion = useReduceMotion();
  const filled =
    variant === 'primary' ||
    variant === 'filled' ||
    (on === true && variant === 'default');
  const text = ['plain', 'quiet', 'text', 'destructive', 'danger'].includes(
    variant,
  );
  const outlined = variant === 'outlined';
  const danger = variant === 'destructive' || variant === 'danger';
  const tone =
    disabled && !loading
      ? 'inkSoft'
      : filled
        ? 'onNavy'
        : danger
          ? 'danger'
          : 'navy';
  const backgroundColor =
    disabled && !loading
      ? colors.sunken
      : filled
        ? colors.navy
        : text || outlined
          ? 'transparent'
          : colors.navyWash;
  return (
    <Pressable
      ref={ref}
      accessibilityRole={on === undefined ? 'button' : 'switch'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: disabled || loading,
        busy: loading,
        ...(on === undefined ? {} : { checked: on, selected: on }),
        ...(selected === undefined ? {} : { selected }),
        ...(expanded === undefined ? {} : { expanded }),
      }}
      disabled={disabled || loading}
      hitSlop={hitSlop}
      testID={testID}
      onPress={onPress}
      android_ripple={
        filled ? { color: androidControls.rippleOnFilled } : undefined
      }
      style={[
        styles.button,
        {
          minHeight: Math.max(
            androidControls.buttonHeight,
            controlHeight[size],
          ),
          alignSelf: fullWidth || (stacked && !hug) ? 'stretch' : 'flex-start',
          borderRadius: stacked ? 12 : 24,
          borderCurve: 'continuous',
          backgroundColor,
          borderColor: outlined ? colors.lineControl : 'transparent',
        },
      ]}
    >
      <View
        collapsable={false}
        style={[styles.content, loading ? { opacity: 0 } : null]}
      >
        {symbol || icon ? (
          <Icon name={(symbol ?? icon)!} tone={tone} maxScale={1} />
        ) : null}
        <Text variant="strong" tone={tone} wordSafe style={styles.label}>
          {label}
        </Text>
        {trailingIcon ? (
          <Icon name={trailingIcon} tone={tone} maxScale={1} />
        ) : null}
      </View>
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          {reduceMotion ? (
            <Icon name={symbols.loading} tone={tone} />
          ) : (
            <ActivityIndicator color={colors[tone]} />
          )}
        </View>
      ) : null}
    </Pressable>
  );
}

/** The shell already contains Expo UI's native Material 3 switch. The row owns semantics. */
export function AndroidSwitch({
  value,
  disabled,
}: {
  value: boolean;
  disabled: boolean;
}) {
  if (Platform.OS !== 'android') return null;
  // Load Compose only on Android; its asset transformer never runs on iOS.
  const { Host, Switch: MaterialSwitch } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@expo/ui/jetpack-compose') as typeof import('@expo/ui/jetpack-compose');
  return (
    <Host
      style={{ width: 52, height: 48 }}
      colorScheme="light"
      seedColor={colors.navy}
      pointerEvents="none"
    >
      <MaterialSwitch
        value={value}
        enabled={!disabled}
        colors={{
          checkedTrackColor: colors.navy,
          checkedThumbColor: colors.onNavy,
          uncheckedTrackColor: colors.sunken,
          uncheckedBorderColor: colors.inkSoft,
          uncheckedThumbColor: colors.inkSoft,
          disabledCheckedTrackColor: colors.lineControl,
          disabledCheckedThumbColor: colors.sunken,
          disabledUncheckedTrackColor: colors.sunken,
          disabledUncheckedBorderColor: colors.lineControl,
          disabledUncheckedThumbColor: colors.lineControl,
        }}
      />
    </Host>
  );
}
const styles = StyleSheet.create({
  button: {
    minWidth: 48,
    maxWidth: '100%',
    flexShrink: 1,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  label: { flexShrink: 1, textAlign: 'center' },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Outlined Material field; the input and clear action each retain their own semantics. */
export function AndroidField({
  label,
  hint,
  error,
  required = false,
  labelHidden = false,
  grouped: _grouped,
  variant = 'text',
  inputRef,
  ...input
}: import('react').ComponentProps<typeof import('./controls').Field>) {
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(input.defaultValue ?? '');
  const disabled = input.editable === false;
  const value = input.value ?? draft;
  const search = input.returnKeyType === 'search';
  const oneTimeCode =
    variant === 'code' ||
    input.textContentType === 'oneTimeCode' ||
    input.autoComplete === 'sms-otp' ||
    input.autoComplete === 'one-time-code';
  const outline = focused || error ? 2 : 1;
  const description = [error ? `Error: ${error}` : null, hint]
    .filter(Boolean)
    .join('. ');
  return (
    <View style={{ gap: 8, alignSelf: 'stretch' }}>
      {!labelHidden ? (
        <Text
          variant="secondary"
          tone={error ? 'danger' : focused ? 'navy' : 'inkSoft'}
          wordSafe
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {label}
          {required ? ' (required)' : ''}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: input.multiline ? 'flex-start' : 'center',
          minHeight: 56,
          borderRadius: search ? 28 : androidControls.fieldRadius,
          borderCurve: 'continuous',
          borderWidth: outline,
          borderColor: error
            ? colors.danger
            : focused
              ? colors.navy
              : colors.lineControl,
          backgroundColor: disabled || search ? colors.sunken : colors.raised,
        }}
      >
        {search ? (
          <View style={{ paddingLeft: 14 - outline }}>
            <Icon name={symbols.search} tone="inkSoft" />
          </View>
        ) : null}
        <TextInput
          {...input}
          ref={ref}
          value={input.value}
          accessibilityLabel={`${label}${required ? ', required' : ''}`}
          accessibilityHint={description || undefined}
          accessibilityState={{ disabled }}
          allowFontScaling
          maxFontSizeMultiplier={0}
          clearButtonMode="never"
          underlineColorAndroid="transparent"
          selectionColor={colors.navy}
          cursorColor={colors.navy}
          placeholderTextColor={colors.inkSoft}
          onChangeText={(next) => {
            setDraft(next);
            input.onChangeText?.(next);
          }}
          onFocus={(event) => {
            setFocused(true);
            input.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            input.onBlur?.(event);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 56 - 2 * outline,
            fontFamily: interfaceFonts.sans,
            fontSize: variant === 'code' ? 22 : 17,
            lineHeight: variant === 'code' ? 28 : 24,
            includeFontPadding: false,
            textAlignVertical: input.multiline ? 'top' : 'center',
            paddingHorizontal: 14 - outline,
            paddingVertical: 14 - outline,
            color: disabled ? colors.inkSoft : colors.ink,
            ...(variant === 'code' ? { fontVariant: ['tabular-nums'] } : {}),
          }}
        />
        {focused &&
        value.length > 0 &&
        !disabled &&
        !input.secureTextEntry &&
        // A one-time code never shows the clear button, as on iOS: it takes
        // the digits' room at large text. Backspace still deletes.
        !oneTimeCode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLocaleLowerCase('en-AU')}`}
            testID={input.testID ? `${input.testID}-clear` : undefined}
            onPress={() => {
              ref.current?.clear();
              setDraft('');
              input.onChangeText?.('');
              ref.current?.focus();
            }}
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 24,
              borderCurve: 'continuous',
            }}
            android_ripple={{ borderless: true }}
          >
            <Icon name={symbols.close} tone="inkSoft" />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text variant="footnote">{hint}</Text> : null}
      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
