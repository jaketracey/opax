import { useRef, useState, type Ref } from 'react';
import {
  ActivityIndicator,
  type AccessibilityState,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { Icon, type SFSymbol } from './icon';
import { Text, type TextTone } from './text';
import {
  colors,
  controlHeight,
  fonts,
  hairline,
  minimumTarget,
  radius,
  spacing,
  type ControlSize,
  type Role,
} from './tokens';

export type ButtonVariant = 'primary' | 'default' | 'quiet' | 'danger';
type Fill = Role | null;
interface ControlColours {
  fill: Fill;
  border: Fill;
  label: TextTone;
}
// Every state is opaque role colours, never opacity, so each drawn pair is in
// the contrast table (contrast.ts) and checked by tests/contrast.test.ts.
export const buttonStates: Record<
  ButtonVariant,
  Record<'rest' | 'pressed' | 'disabled', ControlColours>
> = {
  primary: {
    rest: { fill: 'navy', border: 'navy', label: 'onNavy' },
    pressed: { fill: 'navyRaised', border: 'navyRaised', label: 'onNavy' },
    disabled: { fill: 'sunken', border: 'lineStrong', label: 'inkSoft' },
  },
  // A tinted capsule (UI polish, Oct 2026), as Follow and the choice chips
  // draw: navy on its wash, no outline. The border takes the fill's colour so
  // the geometry matches the outlined variants.
  default: {
    rest: { fill: 'navyWash', border: 'navyWash', label: 'navy' },
    pressed: { fill: 'sunken', border: 'sunken', label: 'navy' },
    disabled: { fill: 'sunken', border: 'sunken', label: 'inkSoft' },
  },
  quiet: {
    rest: { fill: null, border: null, label: 'navy' },
    pressed: { fill: 'sunken', border: null, label: 'navy' },
    disabled: { fill: null, border: null, label: 'inkSoft' },
  },
  danger: {
    rest: { fill: 'raised', border: 'danger', label: 'danger' },
    pressed: { fill: 'sunken', border: 'danger', label: 'danger' },
    disabled: { fill: 'sunken', border: 'lineStrong', label: 'inkSoft' },
  },
};
const fill = (role: Fill) => (role ? colors[role] : 'transparent');

export interface ButtonProps {
  ref?: Ref<View>;
  label: string;
  onPress: () => void;
  /** Primary is the navy action; there is no bronze or gold button. */
  variant?: ButtonVariant;
  size?: ControlSize;
  /** Leading SF Symbol, decorative. */
  icon?: SFSymbol;
  disabled?: boolean;
  /** Keeps the label (and so the width and accessible name) while working. */
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  /** Disclosure state; disabled and busy remain controlled by the button. */
  expanded?: AccessibilityState['expanded'];
  testID?: string;
}

/** Actions. Use a text link or row with a real destination for navigation. */
export function Button({
  ref,
  label,
  onPress,
  variant = 'default',
  size = 'default',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityHint,
  expanded,
  testID,
}: ButtonProps) {
  const states = buttonStates[variant];
  const reduceMotion = useReduceMotion();
  // At accessibility sizes a hugging button takes the column's width: a
  // fixed frame for word-safe text, which could otherwise chase a width that
  // follows its own size. The capsule becomes a rounded rectangle there.
  const stacked = useAccessibilitySize();
  const inert = disabled || loading;
  // Loading keeps the resting look; only a disabled button changes colour.
  const resting = disabled && !loading ? states.disabled : states.rest;
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        disabled: inert,
        busy: loading,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      testID={testID}
      disabled={inert}
      onPress={onPress}
      style={({ pressed }) => {
        const state = pressed && !inert ? states.pressed : resting;
        return [
          styles.button,
          { minHeight: controlHeight[size] },
          fullWidth || stacked ? styles.full : styles.hug,
          stacked ? styles.buttonStacked : null,
          // A frameless button reads from the leading edge once it stretches.
          stacked && variant === 'quiet' ? styles.leading : null,
          {
            backgroundColor: fill(state.fill),
            borderColor: fill(state.border),
          },
        ];
      }}
    >
      {({ pressed }) => {
        const state = pressed && !inert ? states.pressed : resting;
        return (
          <>
            <View
              style={[styles.buttonContent, loading ? styles.hidden : null]}
            >
              {icon ? <Icon name={icon} tone={state.label} /> : null}
              <Text
                variant="control"
                tone={state.label}
                wordSafe
                style={
                  stacked && variant === 'quiet' ? undefined : styles.center
                }
              >
                {label}
              </Text>
            </View>
            {loading ? (
              <View style={styles.spinner} pointerEvents="none">
                {reduceMotion ? (
                  <View
                    style={[
                      styles.staticSpinner,
                      { borderColor: colors[state.label] },
                    ]}
                  />
                ) : (
                  <ActivityIndicator color={colors[state.label]} />
                )}
              </View>
            ) : null}
          </>
        );
      }}
    </Pressable>
  );
}

/** An icon-only button. The accessible name is required, not optional. */
export function IconButton({
  symbol,
  accessibilityLabel,
  onPress,
  variant = 'quiet',
  disabled = false,
  testID,
}: {
  symbol: SFSymbol;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: Extract<ButtonVariant, 'quiet' | 'default'>;
  disabled?: boolean;
  testID?: string;
}) {
  const states = buttonStates[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      // Voice Control and the Large Content Viewer use the same name.
      accessibilityShowsLargeContentViewer
      accessibilityLargeContentTitle={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        const state = disabled
          ? states.disabled
          : pressed
            ? states.pressed
            : states.rest;
        return [
          styles.iconButton,
          {
            backgroundColor: fill(state.fill),
            borderColor: fill(state.border),
          },
        ];
      }}
    >
      {({ pressed }) => (
        <Icon
          name={symbol}
          size={22}
          tone={
            (disabled
              ? states.disabled
              : pressed
                ? states.pressed
                : states.rest
            ).label
          }
        />
      )}
    </Pressable>
  );
}

/**
 * Topic metadata: bronze wash, a decorative hash marker, bronze-ink label.
 * Never a filter control or a submit button. With `onPress` it is a link to
 * the topic, with a 44pt hit area around its 28pt visual.
 */
export function Tag({
  label,
  onPress,
  kind = 'Topic',
  testID,
}: {
  label: string;
  onPress?: () => void;
  /** What VoiceOver says before the label: "Topic: Housing". */
  kind?: string;
  testID?: string;
}) {
  // Pressed keeps the 4.67:1 label and adds an outline and an underline, so
  // feedback never lowers contrast or relies on colour.
  const visual = (pressed: boolean) => (
    <View style={[styles.tag, pressed ? styles.tagPressed : null]}>
      <Text variant="tag" accessible={false}>
        #
      </Text>
      <Text
        variant="tag"
        accessible={false}
        style={pressed ? styles.underline : null}
      >
        {label}
      </Text>
    </View>
  );
  if (!onPress)
    return (
      <View
        accessible
        accessibilityLabel={`${kind}: ${label}`}
        testID={testID}
        style={styles.tagWrap}
      >
        {visual(false)}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${kind}: ${label}`}
      testID={testID}
      onPress={onPress}
      style={styles.tagWrap}
    >
      {({ pressed }) => visual(pressed)}
    </Pressable>
  );
}

/** An applied filter. The whole chip removes it. */
export function FilterChip({
  filter,
  value,
  onRemove,
  testID,
}: {
  /** The filter's name in a sentence: "kind", "parliament". */
  filter: string;
  value: string;
  onRemove: () => void;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove the ${filter} filter, ${value}`}
      testID={testID}
      hitSlop={{ top: 2, bottom: 2 }}
      onPress={onRemove}
      style={({ pressed }) => [
        styles.chip,
        stacked ? styles.chipStacked : null,
        { backgroundColor: pressed ? colors.sunken : colors.navyWash },
      ]}
    >
      <Text variant="metadata" style={styles.chipText} accessible={false}>
        <Text variant="metadata" tone="inkSoft">
          {filter[0]!.toLocaleUpperCase('en-AU') + filter.slice(1)}{' '}
        </Text>
        <Text
          variant="metadata"
          tone="ink"
          style={{ fontFamily: fonts.sansSemiBold }}
        >
          {value}
        </Text>
      </Text>
      <Icon name="xmark" size={16} tone="ink" />
    </Pressable>
  );
}

export interface Segment<T extends string> {
  value: T;
  label: string;
  testID?: string;
}
/**
 * One choice among peers (bill status). The whole control is 48pt tall
 * outside; labels wrap, and at accessibility sizes the segments stack.
 * `stacked` stacks them at every size, for labels whose longest word would
 * not fit an equal share of the row ("House of Representatives").
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  stacked: alwaysStacked = false,
  testID,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  stacked?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize() || alwaysStacked;
  return (
    <View
      testID={testID}
      style={[styles.segmented, stacked ? styles.segmentedStacked : null]}
    >
      {segments.map((segment, index) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="button"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            accessibilityValue={{ text: `${index + 1} of ${segments.length}` }}
            testID={segment.testID}
            onPress={() => onChange(segment.value)}
            style={[styles.segment, stacked ? null : styles.segmentInline]}
          >
            {({ pressed }) => (
              <>
                {/* The highlight sits 3pt inside the 44pt target, so the
                    control still reads as 48pt outside with 4pt insets. */}
                <View
                  style={[
                    styles.segmentFill,
                    {
                      backgroundColor: selected
                        ? colors.navy
                        : pressed
                          ? colors.sunken
                          : 'transparent',
                    },
                  ]}
                />
                <Text
                  variant="control"
                  tone={selected ? 'onNavy' : 'navy'}
                  wordSafe
                  style={styles.center}
                >
                  {segment.label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One choice among several longer labels ("Contracts by agency"), as wrapping
 * capsules instead of a tall stack of segments: navy when chosen, a navy wash
 * otherwise. 36pt drawn, 44pt to touch. Each reads its label, "selected" and
 * "2 of 4", as a segmented control does.
 */
export function ChoiceChips<T extends string>({
  segments,
  value,
  onChange,
  testID,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  // A hugging chip's width follows its text, so word-safe sizing (which
  // re-measures when its column changes) could chase its own frame. At
  // accessibility sizes the chips take the full width, a fixed column for
  // word-safe text; at other sizes the short labels wrap normally.
  const stacked = useAccessibilitySize();
  return (
    <View testID={testID} style={styles.chips}>
      {segments.map((segment, index) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="button"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            accessibilityValue={{ text: `${index + 1} of ${segments.length}` }}
            testID={segment.testID}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [
              styles.choice,
              stacked ? styles.choiceStacked : null,
              {
                backgroundColor: selected
                  ? pressed
                    ? colors.navyRaised
                    : colors.navy
                  : pressed
                    ? colors.sunken
                    : colors.navyWash,
              },
            ]}
          >
            <Text
              variant="control"
              tone={selected ? 'onNavy' : 'navy'}
              wordSafe={stacked}
              style={styles.center}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A labelled text field with optional hint, error and required marker. */
export function Field({
  label,
  hint,
  error,
  required = false,
  testID,
  ...input
}: Omit<
  TextInputProps,
  'style' | 'accessibilityLabel' | 'accessibilityHint'
> & {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  testID?: string;
}) {
  const ref = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const disabled = input.editable === false;
  const description = [error ? `Error: ${error}` : null, hint]
    .filter(Boolean)
    .join('. ');
  return (
    <View style={styles.field}>
      {/* The input carries the label, so VoiceOver reads it once. */}
      <Text
        variant="control"
        wordSafe
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onPress={() => ref.current?.focus()}
      >
        {label}
        {required ? (
          <Text variant="metadata" tone="inkSoft">
            {' '}
            (required)
          </Text>
        ) : null}
      </Text>
      <TextInput
        ref={ref}
        {...input}
        testID={testID}
        accessibilityLabel={required ? `${label}, required` : label}
        accessibilityHint={description || undefined}
        onFocus={(event) => {
          setFocused(true);
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          input.onBlur?.(event);
        }}
        allowFontScaling
        maxFontSizeMultiplier={0}
        // Faint text is for raised surfaces only; a disabled field is sunken.
        placeholderTextColor={disabled ? colors.inkSoft : colors.inkFaint}
        style={[
          styles.input,
          disabled ? styles.inputDisabled : null,
          // Focus and error are 2pt, so neither depends on colour alone.
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      />
      {hint ? (
        <Text
          variant="fine"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {hint}
        </Text>
      ) : null}
      {error ? (
        <View
          style={styles.error}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Icon name="exclamationmark.circle" size={16} tone="danger" />
          <Text variant="fine" tone="danger">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Content rules. Default between major sections, subtle for rows and
 * subheadings, accent (bronze) only for intentional emphasis. Layouts own the
 * spacing around them.
 */
export function Divider({
  variant = 'default',
}: {
  variant?: 'default' | 'subtle' | 'accent';
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: hairline,
        alignSelf: 'stretch',
        backgroundColor:
          variant === 'subtle'
            ? colors.dividerSubtle
            : variant === 'accent'
              ? colors.bronze
              : colors.dividerDefault,
      }}
    />
  );
}

// Segment geometry: 44 + 2 * (1 + 1) = 48 outside; the highlight is inset
// 3pt so it sits 4pt inside the border, as the web's segments do.
const segmentPadding = (controlHeight.default - minimumTarget) / 2 - hairline;
const segmentInset = spacing.s1 - segmentPadding;

const styles = StyleSheet.create({
  // Capsules, as iOS draws text buttons; a 14pt corner once the label can
  // wrap (accessibility sizes), so a two-line label is not a lozenge.
  button: {
    minWidth: minimumTarget,
    borderRadius: 999,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonStacked: { borderRadius: radius + 10 },
  leading: { alignItems: 'flex-start' },
  hug: { alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    flexShrink: 1,
  },
  center: { textAlign: 'center' },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staticSpinner: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderStyle: 'dotted',
  },
  iconButton: {
    minWidth: minimumTarget,
    minHeight: minimumTarget,
    borderRadius: radius,
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Linked and plain tags share the 44pt box so a row of them aligns.
  tagWrap: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: minimumTarget,
  },
  // The outline replaces the 1pt of padding it occupies, so nothing moves.
  tagPressed: {
    borderWidth: hairline,
    borderColor: colors.bronzeInk,
    paddingHorizontal: spacing.s3 - hairline,
    paddingVertical: spacing.s1 - hairline,
  },
  underline: { textDecorationLine: 'underline' },
  tag: {
    flexDirection: 'row',
    gap: spacing.s1,
    minHeight: 28,
    alignItems: 'center',
    borderRadius: radius,
    backgroundColor: colors.bronzeWash,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s1,
  },
  // A tinted capsule (UI polish, Oct 2026): the close symbol and the wash
  // mark it as a control; no outline.
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: minimumTarget - 4,
    maxWidth: '100%',
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: spacing.s2,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
  chipStacked: { alignSelf: 'stretch', borderRadius: radius + 10 },
  chipText: { flexShrink: 1 },
  segmented: {
    flexDirection: 'row',
    gap: spacing.s1,
    // 48pt outside: a 44pt target, 1pt padding and a 1pt border each side.
    paddingVertical: segmentPadding,
    paddingHorizontal: spacing.s1,
    minHeight: controlHeight.default,
    borderWidth: hairline,
    borderColor: colors.lineStrong,
    borderRadius: radius + 4,
    backgroundColor: colors.raised,
  },
  segmentedStacked: { flexDirection: 'column' },
  segment: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    paddingHorizontal: spacing.s3,
    paddingVertical: segmentInset + spacing.s1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentFill: {
    position: 'absolute',
    top: segmentInset,
    bottom: segmentInset,
    left: 0,
    right: 0,
    borderRadius: radius,
  },
  segmentInline: { flex: 1, flexBasis: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s3 },
  choiceStacked: { alignSelf: 'stretch', borderRadius: radius + 12 },
  choice: {
    minHeight: 36,
    maxWidth: '100%',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: spacing.s1,
    borderRadius: 999,
  },
  field: { gap: spacing.s3, alignSelf: 'stretch' },
  input: {
    minHeight: controlHeight.default,
    borderWidth: hairline,
    borderColor: colors.lineStrong,
    borderRadius: radius,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    fontFamily: fonts.sans,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.raised,
  },
  inputDisabled: { backgroundColor: colors.sunken },
  inputFocused: { borderColor: colors.navy, borderWidth: 2 },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  error: { flexDirection: 'row', gap: spacing.s2, alignItems: 'flex-start' },
});
