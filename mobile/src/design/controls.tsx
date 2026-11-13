import { AndroidButton, AndroidSwitch, AndroidField } from './android-controls';
import { Pressable } from './pressable';
import { Host, Picker, Text as SwiftText } from '@expo/ui/swift-ui';
import {
  accessibilityIdentifier,
  frame,
  menuIndicator,
  disabled as nativeDisabled,
  accessibilityLabel as nativeLabel,
  pickerStyle,
  tag,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { router } from 'expo-router';
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  ActivityIndicator,
  Keyboard,
  Platform,
  StyleSheet,
  Switch,
  TextInput,
  View,
  useWindowDimensions,
  useAnimatedValue,
  type AccessibilityState,
  type TextInputProps,
} from 'react-native';
import type { FollowKind } from '../features/follows/store';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { HeightReveal } from './reveal';
import { Hoverable, columns, useLayout } from './adaptive';
import { haptic } from './haptics';
import { Icon, type SFSymbol } from './icon';
import { ChoiceChip } from './labels';
import { Group } from './layout';
import { showMenu } from './menu';
import { phoneCopy } from './phone-copy';
import { symbols } from './symbols';
import { useRowHighlight } from './row-padding';
import { Text, type TextTone } from './text';
import {
  androidControls,
  colors,
  controlHeight,
  interfaceFonts as fonts,
  hairline,
  minimumTarget,
  radii,
  rhythm,
  rhythmRegular,
  size as sizes,
  textStyles,
  type ControlSize,
  type Role,
} from './tokens';

export { ChoiceChip, Tag } from './labels';

type LegacyButtonVariant = 'default' | 'quiet' | 'danger';
export type ButtonVariant =
  | 'filled'
  | 'tonal'
  | 'outlined'
  | 'text'
  | 'primary'
  | 'secondary'
  | 'plain'
  | 'destructive'
  | LegacyButtonVariant;
type Fill = Role | null;
interface ControlColours {
  fill: Fill;
  border: Fill;
  label: TextTone;
}
// Every state is opaque role colours, never opacity, so each drawn pair is in
// the contrast table (contrast.ts) and checked by tests/contrast.test.ts.
const originalButtonStates: Record<
  'primary' | LegacyButtonVariant,
  Record<'rest' | 'pressed' | 'disabled', ControlColours>
> = {
  primary: {
    rest: { fill: 'navy', border: 'navy', label: 'onNavy' },
    pressed: { fill: 'navyRaised', border: 'navyRaised', label: 'onNavy' },
    disabled: { fill: 'sunken', border: 'lineControl', label: 'inkSoft' },
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
    rest: { fill: null, border: null, label: 'danger' },
    pressed: { fill: 'sunken', border: null, label: 'danger' },
    disabled: { fill: 'sunken', border: 'lineControl', label: 'inkSoft' },
  },
};
export const buttonStates = {
  filled: originalButtonStates.primary,
  tonal: originalButtonStates.default,
  outlined: originalButtonStates.default,
  text: originalButtonStates.quiet,
  ...originalButtonStates,
  secondary: originalButtonStates.default,
  plain: originalButtonStates.quiet,
  destructive: originalButtonStates.danger,
};
// Compatibility toggle colours. Follow explicitly uses the secondary variant
// in both states; selected icon-only controls retain their existing navy fill.
export const toggleStates: Record<
  'off' | 'on',
  Record<'rest' | 'pressed' | 'disabled', ControlColours>
> = {
  off: buttonStates.default,
  on: {
    rest: { fill: 'navy', border: 'navy', label: 'onNavy' },
    pressed: { fill: 'navyRaised', border: 'navyRaised', label: 'onNavy' },
    disabled: { fill: 'sunken', border: 'sunken', label: 'inkSoft' },
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
  symbol?: SFSymbol;
  symbolAnimation?: 'bounce' | null;
  /** Trailing SF Symbol, decorative: the chevron on a "next" step. */
  trailingIcon?: SFSymbol;
  /** The spoken name when the visible label is short ("Next month, August 2026"). */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Keeps the label (and so the width and accessible name) while working. */
  loading?: boolean;
  fullWidth?: boolean;
  hug?: boolean;
  accessibilityHint?: string;
  /** Disclosure state; disabled and busy remain controlled by the button. */
  expanded?: AccessibilityState['expanded'];
  /** Selected button state without switch semantics. */
  selected?: boolean;
  /**
   * A legacy toggle, said as a switch with its state. Follow passes secondary
   * explicitly so both states use the same tint capsule. `variant` does not apply to a toggle; give the
   * state's own `label` and `icon` ("Follow" with a plus, "Following" with
   * a check).
   */
  on?: boolean;
  /** Extra touch area around a compact capsule, as the platform allows. */
  hitSlop?: number;
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
  symbol,
  symbolAnimation,
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
  const toggle = on !== undefined;
  const states = toggle
    ? variant === 'secondary'
      ? buttonStates.secondary
      : toggleStates[on ? 'on' : 'off']
    : buttonStates[variant];
  const reduceMotion = useReduceMotion();
  // At accessibility sizes a hugging button takes the column's width: a
  // fixed frame for word-safe text, which could otherwise chase a width that
  // follows its own size. The capsule becomes a rounded rectangle there.
  const stacked = useAccessibilitySize();
  const inert = disabled || loading;
  // Loading keeps the resting look; only a disabled button changes colour.
  const resting = disabled && !loading ? states.disabled : states.rest;
  if (Platform.OS === 'android')
    return (
      <AndroidButton
        {...{
          ref,
          label,
          onPress,
          variant,
          size,
          icon,
          symbol,
          symbolAnimation,
          trailingIcon,
          disabled,
          loading,
          fullWidth,
          hug,
          accessibilityLabel,
          accessibilityHint,
          expanded,
          selected,
          on,
          hitSlop,
          testID,
        }}
      />
    );
  return (
    <Hoverable
      effect={inert ? 'none' : 'highlight'}
      cornerRadius={stacked ? radii.container : radii.capsule}
      style={fullWidth || (stacked && !hug) ? styles.full : styles.hug}
    >
      <Pressable
        ref={ref}
        accessibilityRole={toggle ? 'switch' : 'button'}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: inert,
          busy: loading,
          ...(toggle ? { checked: on, selected: on } : {}),
          ...(selected === undefined ? {} : { selected }),
          ...(expanded === undefined ? {} : { expanded }),
        }}
        testID={testID}
        disabled={inert}
        hitSlop={hitSlop}
        onPress={onPress}
        style={({ pressed }) => {
          const state = pressed && !inert ? states.pressed : resting;
          return [
            styles.button,
            {
              minHeight:
                variant === 'primary' && fullWidth ? 50 : minimumTarget,
            },
            fullWidth || (stacked && !hug) ? styles.full : styles.hug,
            stacked ? styles.buttonStacked : null,
            // A frameless button's label lines up with the text column; its
            // pressed wash bleeds into the margin. A stretched button reads
            // from the leading edge, its symbol beside its label.
            (variant === 'quiet' ||
              variant === 'plain' ||
              variant === 'destructive' ||
              variant === 'danger') &&
            !toggle
              ? styles.quiet
              : null,
            stacked ? styles.leading : null,
            {
              backgroundColor:
                variant === 'primary' || (toggle && variant === 'default')
                  ? fill(state.fill)
                  : 'transparent',
              borderColor: 'transparent',
            },
          ];
        }}
      >
        {({ pressed }) => {
          const state = pressed && !inert ? states.pressed : resting;
          return (
            <>
              {/* Never flattened on Android. Loading toggles opacity, and a
                  flattened view would move its label in and out of a native
                  parent; Fabric crashed doing that while sign-in's screen was
                  popping ("child already has a parent"). UIKit reparents views
                  itself, so iOS keeps build 34's tree. */}
              <View
                collapsable={Platform.OS === 'android' ? false : undefined}
                style={[
                  styles.buttonContent,
                  {
                    minHeight: 32,
                    paddingVertical: 4,
                    paddingHorizontal: 12,
                    borderRadius: stacked ? radii.container : radii.capsule,
                    borderCurve: 'continuous',
                    backgroundColor: fill(state.fill),
                  },
                  loading ? styles.hidden : null,
                ]}
              >
                {symbol || icon ? (
                  <Icon
                    name={(symbol ?? icon)!}
                    tone={state.label}
                    animation={symbolAnimation}
                  />
                ) : null}
                <Text
                  variant="strong"
                  tone={state.label}
                  wordSafe
                  style={stacked ? styles.shrink : styles.center}
                >
                  {label}
                </Text>
                {trailingIcon ? (
                  <Icon name={trailingIcon} tone={state.label} />
                ) : null}
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
    </Hoverable>
  );
}

export function FollowButton({
  kind,
  id,
  title,
  testID = 'follow',
}: {
  kind: FollowKind;
  id: string;
  title: string;
  /** E2E reads the state from the suffix: `<testID>-on` or `<testID>-off`. */
  testID?: string;
}) {
  // Load the engine only when a follow control is mounted.
  const { FOLLOW_LIMIT, followWithFeedback, followKey, unfollow, useFollows } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../features/follows/store') as typeof import('../features/follows/store');
  const { markSeenNow } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../features/follows/useFollowStates') as typeof import('../features/follows/useFollowStates');
  const follows = useFollows();
  const key = followKey({ kind, id });
  const current = follows?.find((f) => followKey(f) === key);
  const following = !!current;
  const [bounce, setBounce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const marked = useRef(false);
  const reduceMotion = useReduceMotion();
  const opacity = useAnimatedValue(1);
  const [confirmation, setConfirmation] = useState(false);
  useEffect(() => {
    if (!confirmation) return;
    opacity.setValue(reduceMotion ? 1 : 0);
    const animation = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduceMotion ? 0 : 150,
        useNativeDriver: true,
      }),
      Animated.delay(4000),
      Animated.timing(opacity, {
        toValue: 0,
        duration: reduceMotion ? 0 : 150,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        setMessage(null);
        setConfirmation(false);
      }
    });
    return () => animation.stop();
  }, [confirmation, opacity, reduceMotion]);
  useEffect(() => {
    if (!current) marked.current = false;
    else if (!marked.current) {
      marked.current = true;
      void markSeenNow(current);
    }
  }, [current, markSeenNow]);
  async function toggle() {
    setBounce(false);
    setBusy(true);
    setConfirmation(false);
    opacity.setValue(1);
    setMessage(null);
    setLimitReached(false);
    try {
      if (following) {
        await unfollow(key);
      } else {
        const result = await followWithFeedback({ kind, id, title });
        if (result.status === 'limit') {
          setLimitReached(true);
          setMessage(
            `You can follow up to ${FOLLOW_LIMIT}. Unfollow one to add this.`,
          );
        } else if (result.status === 'followed') {
          setBounce(true);
          haptic('success');
          if (result.showMessage) {
            const line = 'Changes will show on Today.';
            opacity.setValue(reduceMotion ? 1 : 0);
            setMessage(line);
            setConfirmation(true);
            AccessibilityInfo.announceForAccessibility(line);
          }
        }
      }
    } catch {
      setMessage(phoneCopy('Your follows could not be saved on this iPhone.'));
    } finally {
      setBusy(false);
    }
  }
  const inert = busy || follows === null;
  return (
    <View>
      <Button
        hug
        selected={following}
        variant="secondary"
        label={following ? 'Following' : 'Follow'}
        symbol={following ? symbols.following : symbols.follow}
        symbolAnimation={following && bounce ? 'bounce' : null}
        accessibilityLabel={`${following ? 'Following' : 'Follow'} ${title}`}
        size="compact"
        hitSlop={4}
        disabled={inert}
        onPress={() => void toggle()}
        testID={`${testID}-${following ? 'on' : 'off'}`}
      />
      {/* Every message (first follow, limit, save error) takes its own
          height only while shown, and the content below eases down and back
          up rather than jumping. The limit's Edit Following arrives with it. */}
      <HeightReveal reduceMotion={reduceMotion} testID={`${testID}-reveal`}>
        {message ? (
          <Group gap={rhythm.tight} style={styles.followMessage}>
            <Animated.View style={{ opacity: confirmation ? opacity : 1 }}>
              <Text wordSafe variant="footnote" testID={`${testID}-message`}>
                {message}
              </Text>
            </Animated.View>
            {limitReached ? (
              <Button
                label="Edit Following"
                variant="plain"
                onPress={() => router.push('/follows?edit=1')}
                testID={`${testID}-edit-following`}
              />
            ) : null}
          </Group>
        ) : null}
      </HeightReveal>
    </View>
  );
}

export interface PickerOption<T extends string> {
  value: T;
  label: string;
  shortLabel?: string;
  testID?: string;
}

/** The content column's width before a control has measured its own. */
function columnWidth(layout: ReturnType<typeof useLayout>) {
  return Math.max(
    0,
    Math.min(
      layout.width -
        2 * (layout.regular ? rhythmRegular.screen : rhythm.screen),
      columns.readable,
    ),
  );
}

/**
 * Native menu choice drawn as an iOS pop-up button: the current value in
 * the tint with the system's `chevron.up.chevron.down` indicator beside it.
 * `row` adds the label as the row's title (body, leading) with the button
 * trailing, the inset-group row form; at accessibility sizes the button
 * moves under the title and takes the column width so long values wrap.
 */
function MenuPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
  row = false,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  testID?: string;
  row?: boolean;
  disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<View>(null);
  const large = useAccessibilitySize();
  const selected = options.find((option) => option.value === value);
  const current =
    (large ? selected?.shortLabel : undefined) ?? selected?.label ?? value;
  const layout = useLayout();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const fallbackWidth = columnWidth(layout);
  const spoken =
    Platform.OS === 'android'
      ? `${label}, ${selected?.label ?? value}`
      : `${label}, ${selected?.label ?? value}, pop-up button`;
  if (Platform.OS !== 'ios')
    return (
      <Button
        ref={triggerRef}
        expanded={menuOpen}
        label={current}
        variant="secondary"
        disabled={disabled}
        trailingIcon={
          Platform.OS === 'android' ? symbols.chevronDown : symbols.menu
        }
        accessibilityLabel={spoken}
        testID={testID}
        onPress={() => {
          setMenuOpen(true);
          showMenu(
            label,
            options.map((option) => ({
              title: option.label,
              selected: option.value === value,
              onPress: () => {
                if (option.value !== value) {
                  haptic('selection');
                  onChange(option.value);
                }
              },
            })),
            triggerRef.current ?? undefined,
            undefined,
            () => setMenuOpen(false),
          );
        }}
      />
    );
  // At accessibility sizes the button spans the column, so a long value
  // wraps under the title instead of running off the screen.
  const wide = row && large;
  const button = (
    <View
      testID={testID}
      style={[
        wide ? styles.full : styles.hug,
        // Bare, the button sits in a text column under a caption or count:
        // pull the system button's own label padding back so its value
        // starts on that column, not 6 pt inside it.
        row ? null : { marginLeft: -popUpLabelInset },
      ]}
      onLayout={
        wide
          ? (event) => setMeasuredWidth(event.nativeEvent.layout.width)
          : undefined
      }
    >
      <Host
        matchContents={{ vertical: true, horizontal: !wide }}
        style={
          wide
            ? { width: measuredWidth ?? fallbackWidth, maxWidth: '100%' }
            : { minHeight: minimumTarget, maxWidth: '100%' }
        }
      >
        <Picker
          label={label}
          selection={value}
          onSelectionChange={(next: T) => {
            if (!disabled && next !== value) onChange(next);
          }}
          modifiers={[
            pickerStyle('menu'),
            nativeDisabled(disabled),
            // The system indicator, chevron.up.chevron.down, beside the
            // value: what makes the control read as a pop-up, not a tag.
            menuIndicator('visible'),
            tint(colors.navy),
            frame({
              minHeight: minimumTarget,
              ...(wide ? { maxWidth: measuredWidth ?? fallbackWidth } : {}),
              alignment: row ? 'leading' : 'center',
            }),
            nativeLabel(spoken),
            ...(testID ? [accessibilityIdentifier(testID)] : []),
          ]}
        >
          {options.map((option) => (
            <SwiftText
              key={option.value}
              modifiers={[
                tag(option.value),
                ...(option.testID
                  ? [accessibilityIdentifier(option.testID)]
                  : []),
              ]}
            >
              {(large ? option.shortLabel : undefined) ?? option.label}
            </SwiftText>
          ))}
        </Picker>
      </Host>
    </View>
  );
  if (!row) return button;
  return (
    <View style={[styles.menuRow, large ? styles.menuRowStacked : null]}>
      {/* The button speaks the title with its value; the drawn title is
          not a second stop for VoiceOver. */}
      <Text
        variant="body"
        wordSafe
        style={large ? null : styles.menuRowTitle}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
      {button}
    </View>
  );
}

/**
 * An iOS pop-up button: the current value in the tint with the
 * `chevron.up.chevron.down` indicator, opening a checkmarked native menu.
 * With `row`, the label is drawn as the row's title beside it; without, the
 * caller draws the title (a filter row's "From").
 */
/**
 * The leading padding a SwiftUI menu-style Picker draws inside its own
 * frame before the value (measured on iOS 26: money-16's value sat 6 pt
 * right of the "Find an agency" text above it). A bare PopUpButton offsets
 * it so the value aligns with the content's text column.
 */
export const popUpLabelInset = 6;

export function PopUpButton<T extends string>(props: {
  disabled?: boolean;
  label: string;
  value: T;
  options: readonly PickerOption<T>[];
  onChange: (value: T) => void;
  testID?: string;
  row?: boolean;
}) {
  return <MenuPicker {...props} />;
}

/**
 * UISegmentedControl's own label size at the regular control size: 13 pt,
 * semibold on the selected segment. The fit estimate measures every label
 * at the selected weight, so it errs towards the pop-up.
 */
export const segmentLabel = { fontSize: 13, padding: 6, trackInset: 2 };
// SF Pro Semibold advance widths in em, coarse classes.
const narrowGlyphs = new Set("ijlI.,:;'’!|()");
const slimGlyphs = new Set('frt1 ');
const wideGlyphs = new Set('mwMW@%');
function estimatedLabelWidth(label: string, fontSize: number) {
  let em = 0;
  for (const glyph of label) {
    if (narrowGlyphs.has(glyph)) em += 0.27;
    else if (glyph === ' ') em += 0.26;
    else if (slimGlyphs.has(glyph)) em += 0.37;
    else if (wideGlyphs.has(glyph)) em += 0.85;
    else if (glyph !== glyph.toLowerCase()) em += 0.66;
    else em += 0.57;
  }
  return em * fontSize;
}
/**
 * Android: whether the selected segment's 18 dp check and its 8 dp gap fit
 * beside the longest word of every label (17 sp strong, wrapping allowed).
 */
export function checkFits(
  labels: readonly string[],
  width: number,
  fontScale = 1,
): boolean {
  if (!labels.length || !(width > 0)) return false;
  const share = width / labels.length - 2 * rhythm.tight - 2 - (18 + 8);
  const fontSize = 17 * Math.max(1, fontScale);
  return labels.every((label) =>
    label
      .split(/\s+/)
      .every((word) => estimatedLabelWidth(word, fontSize) <= share),
  );
}
/**
 * Whether two to four labels fit a segmented control `width` points wide
 * at the reader's text size without truncating. Segments share the width
 * equally, so the longest label decides. Text smaller than the default
 * counts as the default.
 */
export function segmentsFit(
  labels: readonly string[],
  width: number,
  fontScale = 1,
): boolean {
  if (labels.length < 2 || labels.length > 4 || !(width > 0)) return false;
  const fontSize = segmentLabel.fontSize * Math.max(1, fontScale);
  const share =
    (width - 2 * segmentLabel.trackInset) / labels.length -
    2 * segmentLabel.padding;
  return labels.every((label) => estimatedLabelWidth(label, fontSize) <= share);
}

/** At AX1+ the full current choice reads beneath the title in a native menu row. */
export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: {
  options: readonly PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  const large = useAccessibilitySize();
  if (options.length < 2 || options.length > 4)
    throw new RangeError('SegmentedPicker needs two to four options');
  if (Platform.OS !== 'ios')
    return (
      <SegmentedControl
        segments={options}
        value={value}
        onChange={onChange}
        testID={testID}
      />
    );
  if (large)
    return (
      <MenuPicker
        row
        label={accessibilityLabel}
        value={value}
        options={options}
        onChange={onChange}
        testID={testID}
      />
    );
  return (
    <Host
      style={{ alignSelf: 'stretch', minHeight: minimumTarget }}
      matchContents={{ vertical: true }}
    >
      <Picker
        label={accessibilityLabel}
        selection={value}
        onSelectionChange={(next: T) => {
          if (next !== value) onChange(next);
        }}
        modifiers={[
          pickerStyle('segmented'),
          nativeLabel(accessibilityLabel),
          ...(testID ? [accessibilityIdentifier(testID)] : []),
        ]}
      >
        {options.map((option) => (
          <SwiftText
            key={option.value}
            modifiers={[
              tag(option.value),
              ...(option.testID
                ? [accessibilityIdentifier(option.testID)]
                : []),
            ]}
          >
            {option.label}
          </SwiftText>
        ))}
      </Picker>
    </Host>
  );
}

/**
 * The month pager: a row in the content, with disabled ends that retain
 * their place. Not a bottom `Stack.Toolbar`: iOS 26's floating tab bar
 * stays up on pushed pages and covered it.
 */
export function MonthPager({
  month,
  previous,
  next,
  unit = 'month',
  testID,
  previousTestID,
  nextTestID,
  labels = false,
}: {
  month: string;
  unit?: 'month' | 'year';
  testID?: string;
  previousTestID?: string;
  nextTestID?: string;
  labels?: boolean;
  previous: { label: string; onPress: () => void } | null;
  next: { label: string; onPress: () => void } | null;
}) {
  const before = `Previous ${unit}`,
    after = `Next ${unit}`;
  if (labels)
    return (
      <StepButtons
        testID={testID}
        previous={{
          label: previous?.label ?? before,
          accessibilityLabel: `${before}${previous ? `, ${previous.label}` : ''}`,
          disabled: !previous,
          onPress: () => previous?.onPress(),
          testID: previousTestID,
        }}
        next={{
          label: next?.label ?? after,
          accessibilityLabel: `${after}${next ? `, ${next.label}` : ''}`,
          disabled: !next,
          onPress: () => next?.onPress(),
          testID: nextTestID,
        }}
      />
    );
  return (
    <View style={styles.steps} testID={testID}>
      <IconButton
        symbol={symbols.previous}
        accessibilityLabel={`${before}${previous ? `, ${previous.label}` : ''}`}
        disabled={!previous}
        onPress={() => previous?.onPress()}
        testID={previousTestID}
      />
      <Text variant="subsectionTitle" style={styles.shrink}>
        {month}
      </Text>
      <IconButton
        symbol={symbols.chevron}
        accessibilityLabel={`${after}${next ? `, ${next.label}` : ''}`}
        disabled={!next}
        onPress={() => next?.onPress()}
        testID={nextTestID}
      />
    </View>
  );
}

export interface Step {
  /** The visible destination, short: "June". */
  label: string;
  /** The full spoken name: "Previous month, June 2026". */
  accessibilityLabel: string;
  onPress: () => void;
  /** An end of the range: drawn disabled (ink-soft on sunken), never hidden. */
  disabled?: boolean;
  testID?: string;
}
/**
 * A previous and next pair on one row: previous at the leading edge with a
 * leading chevron, next at the trailing edge with a trailing one. A disabled
 * end stays in place, drawn disabled, so the pair never shifts. At
 * accessibility sizes each takes the full width, one above the other.
 */
export function StepButtons({
  previous,
  next,
  testID,
}: {
  previous: Step;
  next: Step;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  return (
    <View testID={testID} style={stacked ? styles.stepsStacked : styles.steps}>
      <Button
        label={previous.label}
        accessibilityLabel={previous.accessibilityLabel}
        icon="chevron.left"
        size="compact"
        disabled={previous.disabled}
        onPress={previous.onPress}
        testID={previous.testID}
      />
      <Button
        label={next.label}
        accessibilityLabel={next.accessibilityLabel}
        trailingIcon="chevron.right"
        size="compact"
        disabled={next.disabled}
        onPress={next.onPress}
        testID={next.testID}
      />
    </View>
  );
}

export type IconButtonVariant = 'quiet' | 'default' | 'primary' | 'danger';
// Opaque role colours in every state. `selected` (Captions on, Mute on) takes
// the navy fill whatever the variant, and is said as selected.
export const iconButtonStates: Record<
  IconButtonVariant | 'selected',
  Record<'rest' | 'pressed' | 'disabled', ControlColours>
> = {
  quiet: buttonStates.quiet,
  default: buttonStates.default,
  primary: buttonStates.primary,
  danger: {
    rest: { fill: 'danger', border: 'danger', label: 'onNavy' },
    pressed: {
      fill: 'dangerPressed',
      border: 'dangerPressed',
      label: 'onNavy',
    },
    disabled: { fill: 'sunken', border: 'sunken', label: 'inkSoft' },
  },
  selected: toggleStates.on,
};
const iconButtonSizes = {
  default: { box: minimumTarget, symbol: sizes.iconMd },
  large: { box: sizes.controlLarge, symbol: sizes.iconLg },
} as const;

/**
 * An icon-only round button: ⋯, share, voice, close, the call controls. The
 * accessible name is required, not optional, and the Large Content Viewer
 * shows it. 44pt circle with a 20pt symbol; `large` is 56pt (Talk). The
 * symbol keeps its size at every text size (the circle is already a full
 * target). Use a Button when a word fits.
 */
export function IconButton({
  symbol,
  accessibilityLabel,
  onPress,
  variant = 'quiet',
  size = 'default',
  selected,
  disabled = false,
  badge,
  testID,
}: {
  symbol: SFSymbol;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: IconButtonVariant;
  size?: keyof typeof iconButtonSizes;
  /** A toggled control (Captions, Mute): navy while on, said as selected. */
  selected?: boolean;
  disabled?: boolean;
  /** A count beside the symbol (Sources, 3); the label must say it too. */
  badge?: number;
  testID?: string;
}) {
  const states = iconButtonStates[selected ? 'selected' : variant];
  const { box, symbol: symbolSize } = iconButtonSizes[size];
  const stateOf = (pressed: boolean) =>
    disabled ? states.disabled : pressed ? states.pressed : states.rest;
  return (
    <Hoverable effect={disabled ? 'none' : 'highlight'} cornerRadius={box / 2}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{
          disabled,
          ...(selected === undefined ? {} : { selected }),
        }}
        // Voice Control and the Large Content Viewer use the same name.
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle={accessibilityLabel}
        testID={testID}
        disabled={disabled}
        android_ripple={
          Platform.OS === 'android'
            ? {
                borderless: true,
                ...(selected || variant === 'primary' || variant === 'danger'
                  ? { color: androidControls.rippleOnFilled }
                  : {}),
              }
            : undefined
        }
        onPress={onPress}
        style={({ pressed }) => {
          const state = stateOf(pressed);
          return [
            styles.iconButton,
            {
              width: box,
              height: box,
              borderRadius: box / 2,
              borderCurve: 'continuous',
            },
            {
              backgroundColor: fill(state.fill),
              borderColor: fill(state.border),
            },
          ];
        }}
      >
        {({ pressed }) => (
          <>
            <Icon
              name={symbol}
              size={symbolSize}
              maxScale={1}
              tone={stateOf(pressed).label}
            />
            {badge ? (
              <View
                style={styles.badge}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {/* The label carries the count; the capsule still follows Dynamic Type. */}
                <Text
                  variant="capsule"
                  tone="onNavy"
                  tabular
                  style={styles.badgeText}
                >
                  {String(badge)}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </Pressable>
    </Hoverable>
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
        ...(Platform.OS === 'android'
          ? [
              {
                borderRadius: androidControls.chipRadius,
                borderCurve: 'continuous',
                borderWidth: 1,
                borderColor: colors.lineControl,
              } as const,
            ]
          : []),
        { backgroundColor: pressed ? colors.sunken : colors.navyWash },
      ]}
    >
      {Platform.OS === 'android' ? (
        <Icon name={symbols.selected} size={18} tone="navy" />
      ) : null}
      <Text
        wordSafe={Platform.OS === 'android'}
        variant="secondary"
        style={styles.chipText}
        accessible={false}
      >
        <Text variant="secondary" tone="inkSoft">
          {filter[0]!.toLocaleUpperCase('en-AU') + filter.slice(1)}{' '}
        </Text>
        <Text
          variant="secondary"
          tone="ink"
          style={{ fontFamily: fonts.sansSemiBold }}
        >
          {value}
        </Text>
      </Text>
      <Icon name={symbols.close} size={16} tone="ink" />
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
  const { fontScale } = useWindowDimensions();
  const [trackWidth, setTrackWidth] = useState<number | null>(null);
  // Material shows a check on the selected segment, but never at the cost of
  // a word: inline segments draw it only when every label's longest word
  // still fits beside it. Stacked segments always have the room.
  const showCheck =
    Platform.OS === 'android' &&
    (stacked ||
      (trackWidth !== null &&
        checkFits(
          segments.map((segment) => segment.label),
          trackWidth,
          fontScale,
        )));
  return (
    <View
      testID={testID}
      onLayout={
        Platform.OS === 'android'
          ? (event) => setTrackWidth(event.nativeEvent.layout.width)
          : undefined
      }
      style={[
        styles.segmented,
        stacked ? styles.segmentedStacked : null,
        ...(Platform.OS === 'android'
          ? [
              {
                padding: 0,
                gap: 0,
                borderRadius: stacked ? 12 : 24,
                borderCurve: 'continuous',
                borderColor: colors.lineControl,
                backgroundColor: 'transparent',
                overflow: 'hidden' as const,
              } as const,
            ]
          : []),
      ]}
    >
      {segments.map((segment, index) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole={Platform.OS === 'android' ? 'tab' : 'button'}
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            accessibilityValue={{ text: `${index + 1} of ${segments.length}` }}
            testID={segment.testID}
            onPress={() => {
              if (segment.value !== value) {
                haptic('selection');
                onChange(segment.value);
              }
            }}
            style={[
              styles.segment,
              stacked ? null : styles.segmentInline,
              ...(Platform.OS === 'android'
                ? [
                    {
                      flexDirection: 'row' as const,
                      gap: 8,
                      backgroundColor: selected
                        ? colors.navyWash
                        : 'transparent',
                      ...(index
                        ? stacked
                          ? {
                              borderTopWidth: 1,
                              borderTopColor: colors.lineControl,
                            }
                          : {
                              borderLeftWidth: 1,
                              borderLeftColor: colors.lineControl,
                            }
                        : {}),
                    },
                  ]
                : []),
            ]}
          >
            {({ pressed }) => (
              <>
                {/* The highlight sits 3pt inside the 44pt target, so the
                    control still reads as 48pt outside with 4pt insets. */}
                {Platform.OS === 'android' ? (
                  selected && showCheck ? (
                    <Icon
                      name={symbols.selected}
                      size={18}
                      maxScale={1}
                      tone="navy"
                    />
                  ) : null
                ) : (
                  <View
                    style={[
                      styles.segmentFill,
                      {
                        backgroundColor: selected
                          ? colors.raised
                          : pressed
                            ? colors.sunken
                            : 'transparent',
                      },
                    ]}
                  />
                )}
                <Text
                  variant="strong"
                  tone="ink"
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
 * Compatibility for existing single-choice filters. iOS uses native segments
 * for two to four peers whose labels fit the column at the reader's text
 * size, and one pop-up button otherwise; Android retains chips. The pop-up
 * is a titled row when the caller names the choice (`accessibilityLabel`).
 */
export function ChoiceChips<T extends string>({
  segments,
  value,
  onChange,
  testID,
  accessibilityLabel,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { fontScale } = useWindowDimensions();
  const layout = useLayout();
  const [measured, setMeasured] = useState<number | null>(null);
  if (Platform.OS === 'ios' && segments.length > 0) {
    const width = measured ?? columnWidth(layout);
    const fits = segmentsFit(
      segments.map((segment) => segment.label),
      width,
      fontScale,
    );
    return (
      <View
        style={styles.full}
        onLayout={(event) => setMeasured(event.nativeEvent.layout.width)}
      >
        {fits ? (
          <SegmentedPicker
            options={segments}
            value={value}
            onChange={onChange}
            accessibilityLabel={accessibilityLabel ?? 'Options'}
            testID={testID}
          />
        ) : (
          <PopUpButton
            row={accessibilityLabel !== undefined}
            label={accessibilityLabel ?? 'Options'}
            options={segments}
            value={value}
            onChange={onChange}
            testID={
              testID ??
              segments.find((segment) => segment.value === value)?.testID
            }
          />
        )}
      </View>
    );
  }
  // At accessibility sizes each chip takes the full width, a fixed column
  // for word-safe text (ChoiceChip); otherwise the short labels wrap.
  return (
    <View testID={testID} style={styles.chips}>
      {segments.map((segment, index) => (
        <ChoiceChip
          key={segment.value}
          label={segment.label}
          selected={segment.value === value}
          position={`${index + 1} of ${segments.length}`}
          testID={segment.testID}
          onPress={() => onChange(segment.value)}
        />
      ))}
    </View>
  );
}

/**
 * A setting that is on or off: a wrapping label (and an optional detail
 * line) beside the platform switch, the whole row one 44pt target that
 * VoiceOver reads as a switch ("Show former members, switch button, off").
 * At accessibility sizes the switch drops below the label. The track is
 * navy whatever the screen's accent: a switch is not an accent place.
 */
export function SwitchRow({
  label,
  detail,
  value,
  onValueChange,
  disabled = false,
  testID,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const stacked = useAccessibilitySize();
  const highlight = useRowHighlight();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked: value, disabled }}
      testID={testID}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.switchRow,
        stacked ? styles.switchRowStacked : null,
        pressed && !disabled ? { backgroundColor: highlight } : null,
      ]}
    >
      <View style={styles.switchText}>
        <Text variant="strong" wordSafe tone={disabled ? 'inkSoft' : 'ink'}>
          {label}
        </Text>
        {detail ? (
          <Text variant="secondary" wordSafe>
            {detail}
          </Text>
        ) : null}
      </View>
      {/* The row is the control; the switch only draws its state. */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Platform.OS === 'android' ? (
          <AndroidSwitch value={value} disabled={disabled} />
        ) : (
          <Switch
            value={value}
            disabled={disabled}
            trackColor={{ false: colors.lineControl, true: colors.navy }}
          />
        )}
      </View>
    </Pressable>
  );
}

/** A labelled text field with optional hint, error and required marker. */
export function Field({
  label,
  hint,
  error,
  required = false,
  grouped = false,
  labelHidden = false,
  variant = 'text',
  testID,
  inputRef,
  ...input
}: Omit<
  TextInputProps,
  'style' | 'accessibilityLabel' | 'accessibilityHint'
> & {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  grouped?: boolean;
  labelHidden?: boolean;
  variant?: 'text' | 'code';
  testID?: string;
  /** The text input itself, to focus it from a keyboard shortcut. */
  inputRef?: RefObject<TextInput | null>;
}) {
  const ownRef = useRef<TextInput>(null);
  const ref = inputRef ?? ownRef;
  const [focused, setFocused] = useState(false);
  const disabled = input.editable === false;
  const description = [error ? `Error: ${error}` : null, hint]
    .filter(Boolean)
    .join('. ');
  if (Platform.OS === 'android')
    return (
      <AndroidField
        {...{
          label,
          hint,
          error,
          required,
          grouped,
          labelHidden,
          variant,
          testID,
          inputRef,
          ...input,
        }}
      />
    );
  return (
    <View style={styles.field}>
      {/* The input carries the label, so VoiceOver reads it once. */}
      {!labelHidden ? (
        <Text
          variant={grouped ? 'groupHeader' : 'secondary'}
          tone="inkSoft"
          wordSafe
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={() => ref.current?.focus()}
        >
          {label}
          {required ? (
            <Text variant="secondary" tone="inkSoft">
              {' '}
              (required)
            </Text>
          ) : null}
        </Text>
      ) : null}
      {/* The input owns the fill, radius and every border state. InsetGroup
          adds a padded surface outside that boundary, so a single field must
          not use it, even on a grouped screen. */}
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
        // A one-time code never shows the clear button: at AX3 it took
        // the first digit's room while focused. Backspace still deletes.
        clearButtonMode={
          variant === 'code' || input.textContentType === 'oneTimeCode'
            ? 'never'
            : 'while-editing'
        }
        allowFontScaling
        maxFontSizeMultiplier={0}
        // Faint text is for raised surfaces only; a disabled field is sunken.
        placeholderTextColor={disabled ? colors.inkSoft : colors.inkFaint}
        style={[
          styles.input,
          variant === 'code'
            ? {
                fontFamily: textStyles.tileFigure.fontFamily,
                fontSize: textStyles.tileFigure.fontSize,
                lineHeight: textStyles.tileFigure.lineHeight,
                fontWeight: textStyles.tileFigure.fontWeight,
                fontVariant: textStyles.tileFigure.tabular
                  ? ['tabular-nums']
                  : undefined,
              }
            : null,
          grouped ? styles.groupedInput : null,
          disabled ? styles.inputDisabled : null,
          // Focus changes the colour, never the boundary width.
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
        ]}
      />
      {hint ? (
        <Text
          variant="footnote"
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
          <Icon name={symbols.exclamationmarkCircle} size={16} tone="danger" />
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** The frame only. Ask owns sessions, options, tags and stop behaviour. */
export function Composer({
  ref,
  label,
  submitLabel,
  value,
  onChangeText,
  onSubmit,
  onFocus,
  placeholder,
  busy = false,
  onStop,
  leading,
  trailing,
  tags = [],
  note,
  docked = false,
  bottomOffset = 0,
  maxLength,
  testID,
  submitTestID,
  inputRef,
}: {
  ref?: Ref<View>;
  inputRef?: Ref<TextInput>;
  label: string;
  submitLabel: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  onFocus?: TextInputProps['onFocus'];
  placeholder: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  tags?: { id: string; label: string; onRemove: () => void }[];
  note?: string;
  busy?: boolean;
  onStop?: () => void;
  docked?: boolean;
  bottomOffset?: number;
  maxLength?: number;
  testID?: string;
  submitTestID?: string;
}) {
  const { fontScale, height } = useWindowDimensions();
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(() =>
    Platform.OS === 'ios' ? (Keyboard.metrics()?.screenY ?? null) : null,
  );
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const changed = Keyboard.addListener('keyboardWillChangeFrame', (event) =>
      setKeyboardTop(event.endCoordinates.screenY),
    );
    const hidden = Keyboard.addListener('keyboardWillHide', () =>
      setKeyboardTop(null),
    );
    return () => {
      changed.remove();
      hidden.remove();
    };
  }, []);
  const visibleHeight =
    keyboardTop === null ? height : Math.max(0, Math.min(height, keyboardTop));
  const inputHeight = Math.max(
    minimumTarget,
    Math.min(23 * Math.max(1, fontScale) * 5 + 20, visibleHeight * 0.4 - 8),
  );
  const content = (
    <View style={styles.composerBody}>
      {tags.length ? (
        <View style={styles.chips}>
          {tags.map((item) => (
            <Button
              key={item.id}
              label={item.label}
              symbol={symbols.close}
              variant="secondary"
              accessibilityLabel={`Remove ${item.label}`}
              onPress={item.onRemove}
              testID={testID ? `${testID}-tag-${item.id}` : undefined}
            />
          ))}
        </View>
      ) : null}
      <View
        style={
          Platform.OS === 'android'
            ? [
                styles.composer,
                {
                  borderColor: inputFocused ? colors.navy : colors.lineControl,
                  borderWidth: inputFocused ? 2 : 1,
                  paddingLeft: rhythm.block - (inputFocused ? 1 : 0),
                  paddingRight: rhythm.line - (inputFocused ? 1 : 0),
                  paddingVertical: rhythm.line - (inputFocused ? 1 : 0),
                },
              ]
            : styles.composer
        }
      >
        {leading}
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          multiline
          scrollEnabled
          maxLength={maxLength}
          testID={testID}
          accessibilityLabel={label}
          onFocus={onFocus}
          {...(Platform.OS === 'android'
            ? {
                underlineColorAndroid: 'transparent',
                selectionColor: colors.navy,
                cursorColor: colors.navy,
                onFocus: (
                  event: Parameters<NonNullable<TextInputProps['onFocus']>>[0],
                ) => {
                  setInputFocused(true);
                  onFocus?.(event);
                },
                onBlur: () => setInputFocused(false),
              }
            : {})}
          allowFontScaling
          maxFontSizeMultiplier={0}
          placeholderTextColor={colors.inkFaint}
          style={[
            styles.composerInput,
            { maxHeight: inputHeight },
            ...(Platform.OS === 'android'
              ? [
                  {
                    includeFontPadding: false,
                    textAlignVertical: 'top' as const,
                    minWidth: 0,
                  },
                ]
              : []),
          ]}
        />
        {trailing ?? (
          <IconButton
            symbol={busy ? symbols.stop : symbols.send}
            accessibilityLabel={busy ? 'Stop answering' : submitLabel}
            disabled={busy ? !onStop : !value.trim()}
            onPress={busy ? () => onStop?.() : onSubmit}
            testID={submitTestID}
          />
        )}
      </View>
      {note ? (
        <Text variant="footnote" tone="inkSoft">
          {note}
        </Text>
      ) : null}
    </View>
  );
  const glass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  return (
    <View
      ref={ref}
      style={[
        docked ? styles.composerDock : null,
        docked ? { bottom: bottomOffset } : null,
      ]}
    >
      {glass ? (
        <GlassView style={styles.composerGlass} glassEffectStyle="regular">
          {content}
        </GlassView>
      ) : (
        <View
          style={
            Platform.OS === 'android'
              ? [
                  styles.composerFallback,
                  { backgroundColor: colors.sunken, padding: 4 },
                ]
              : styles.composerFallback
          }
        >
          {content}
        </View>
      )}
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
              ? colors.navy
              : colors.dividerDefault,
      }}
    />
  );
}

// iOS retains 44 + 2 * (1 + 1) = 48 outside. Android keeps its 48dp
// touch target plus the border; padding must never become negative.
const segmentPadding = Math.max(
  0,
  (controlHeight.default - minimumTarget) / 2 - hairline,
);
const segmentInset = rhythm.line - segmentPadding;

const styles = StyleSheet.create({
  // The gap Follow's message had in its group, inside the reveal so it opens
  // and closes with the line.
  followMessage: { paddingTop: rhythm.tight },
  // Pills, as iOS draws text buttons (D1: things you press); a 12pt corner
  // once the label can wrap (accessibility sizes), so a two-line label is
  // not a lozenge.
  button: {
    minWidth: minimumTarget,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    borderWidth: hairline,
    paddingHorizontal: 0,
    paddingVertical: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonStacked: { borderRadius: radii.container, borderCurve: 'continuous' },
  leading: { alignItems: 'flex-start' },
  quiet: { marginHorizontal: -12 },
  shrink: { flexShrink: 1 },
  hug: { alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  steps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  stepsStacked: { gap: rhythm.tight },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: rhythm.tight,
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
    borderCurve: 'continuous',
    borderWidth: 2,
    borderStyle: 'dotted',
  },
  iconButton: {
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A count on the call controls' Sources (the button's label says it too).
  // It sits in the button's own top-right corner (empty, the button is a
  // circle), never outside its frame: the Talk dock is a ScrollView, which
  // clipped a badge drawn above the button (Jake, TestFlight, 13 Nov).
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 6,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.navy,
  },
  badgeText: {
    fontVariant: ['tabular-nums'],
  },
  switchRow: {
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.heading,
  },
  switchRowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  switchText: { flexShrink: 1, flexGrow: 1, gap: 2 },
  // A tinted capsule (UI polish, Oct 2026): the close symbol and the wash
  // mark it as a control; no outline.
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: Platform.OS === 'android' ? minimumTarget : minimumTarget - 4,
    maxWidth: '100%',
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: rhythm.tight,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
  chipStacked: {
    alignSelf: 'stretch',
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
  chipText: { flexShrink: 1 },
  segmented: {
    flexDirection: 'row',
    gap: rhythm.line,
    // 48pt outside: a 44pt target, 1pt padding and a 1pt border each side.
    paddingVertical: segmentPadding,
    paddingHorizontal: rhythm.line,
    minHeight: controlHeight.default,
    borderWidth: hairline,
    borderColor: colors.sunken,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
    backgroundColor: colors.sunken,
  },
  segmentedStacked: {
    flexDirection: 'column',
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
  segment: {
    minHeight: minimumTarget,
    minWidth: minimumTarget,
    paddingHorizontal: rhythm.tight,
    paddingVertical: segmentInset + rhythm.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentFill: {
    position: 'absolute',
    top: segmentInset,
    bottom: segmentInset,
    left: 0,
    right: 0,
    borderRadius: radii.capsule,
    borderCurve: 'continuous',
  },
  segmentInline: { flex: 1, flexBasis: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rhythm.tight },
  field: { gap: rhythm.tight, alignSelf: 'stretch' },
  menuRow: {
    alignSelf: 'stretch',
    minHeight: minimumTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  menuRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: rhythm.line,
  },
  menuRowTitle: { flex: 1 },
  groupedInput: { borderRadius: radii.container, borderCurve: 'continuous' },
  composerBody: {
    gap: 8,
    backgroundColor: 'transparent',
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
  composerFallback: {
    backgroundColor: colors.raised,
    borderRadius: radii.container,
    borderCurve: 'continuous',
  },
  composerGlass: {
    borderRadius: radii.container,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  composerDock: { position: 'absolute', left: 0, right: 0 },
  input: {
    minHeight: controlHeight.default,
    borderWidth: 1,
    borderColor: colors.lineControl,
    borderRadius: radii.thumb,
    borderCurve: 'continuous',
    paddingHorizontal: rhythm.block,
    paddingVertical: rhythm.tight,
    fontFamily: fonts.sans,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.raised,
  },
  inputDisabled: { backgroundColor: colors.sunken },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: rhythm.tight,
    borderWidth: hairline,
    borderColor: colors.lineControl,
    borderRadius: radii.container,
    borderCurve: 'continuous',
    backgroundColor: 'transparent',
    paddingLeft: rhythm.block,
    paddingRight: rhythm.line,
    paddingVertical: rhythm.line,
  },
  composerInput: {
    flex: 1,
    minHeight: minimumTarget,
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 0,
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
  },
  sendTarget: {
    minWidth: minimumTarget,
    minHeight: minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: { alignItems: 'center', justifyContent: 'center' },
  inputFocused: { borderColor: colors.navy },
  inputError: { borderColor: colors.danger },
  error: { flexDirection: 'row', gap: rhythm.tight, alignItems: 'flex-start' },
});
