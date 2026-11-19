import { useCallback, useRef, useState, type Ref } from 'react';
import {
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  type PressableProps,
  type View,
} from 'react-native';
import { useHighTextContrast } from './accessibility';
import { spokenFigures } from './format';
import { rememberMenuAnchor } from './menu-anchor';
import { useRowHighlight } from './row-padding';
import { accents, border, androidControls, radii, type Role } from './tokens';
import { androidRipples, useColors } from './use-colors';

/**
 * iOS: how long a touch rests on a surface before it highlights. Nearly every
 * surface sits in a scroll view, and with no delay a row lit up under the
 * finger at the start of each scroll and went dark again as the scroll took
 * the touch. UIKit holds a scroll view's content touches the same way. A
 * quick tap still highlights: React Native presses in at release and keeps
 * the highlight for its minimum press time. Android's ripple is the
 * platform's own and keeps its timing.
 */
export const IOS_PRESS_DELAY = 130;

/**
 * What a touch does to a surface that draws no pressed state of its own, on
 * iOS (Android has its ripple). Every surface either styles `pressed` itself
 * or names one of these, so no control takes a touch without answering it
 * (tests/press-feedback-policy.test.tsx):
 * - `wash`: the design's pressed fill, the same one a row and a quiet button
 *   take, chosen for the ground it sits on (`useRowHighlight`). Never a fade
 *   of the content: a pressed control keeps its contrast.
 * - `none`: on purpose. A backdrop, a picture that opens, a wrapper whose
 *   child draws the highlight, a long-press-only surface.
 */
export type PressFeedback = 'wash' | 'none';
/** The wash's corners where the surface has none of its own. */
const washShape = {
  borderRadius: radii.thumb,
  borderCurve: 'continuous',
} as const;
function usePressedStyle(
  feedback: PressFeedback | undefined,
  style: PressableProps['style'],
): PressableProps['style'] {
  const highlight = useRowHighlight();
  if (Platform.OS !== 'ios' || feedback !== 'wash') return style;
  return (state) => [
    state.pressed ? washShape : null,
    typeof style === 'function' ? style(state) : style,
    state.pressed ? { backgroundColor: highlight } : null,
  ];
}

/** The shared touch surface; keyboard focus adds a layout-neutral outline. */
export function Pressable({
  ref,
  feedback,
  ...props
}: PressableProps & { ref?: Ref<View>; feedback?: PressFeedback }) {
  const colors = useColors();

  const [focused, setFocused] = useState(false);
  const style = usePressedStyle(feedback, props.style);
  const Component =
    Platform.OS === 'android' ? AndroidPressable : NativePressable;
  const ringed =
    focused && !props.disabled && !props.accessibilityState?.disabled;
  const focusStyle = ringed
    ? {
        outlineColor: colors.navy,
        outlineWidth: border.focus,
        outlineOffset: border.focus,
        outlineStyle: 'solid' as const,
      }
    : undefined;
  return (
    <Component
      {...props}
      accessibilityLabel={
        props.accessibilityLabel
          ? spokenFigures(props.accessibilityLabel)
          : undefined
      }
      {...(Platform.OS === 'android'
        ? { ringed }
        : {
            unstable_pressDelay:
              props.unstable_pressDelay ??
              (Platform.OS === 'ios' ? IOS_PRESS_DELAY : undefined),
          })}
      ref={ref}
      onFocus={(event) => {
        setFocused(true);
        props.onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        props.onBlur?.(event);
      }}
      style={
        focusStyle
          ? typeof style === 'function'
            ? (state) => [style(state), focusStyle]
            : [style, focusStyle]
          : style
      }
    />
  );
}
/**
 * React Native's own Pressable with the app's iOS touch timing and press
 * feedback, and nothing else: no Android ripple or minimum target, no focus
 * ring, no change to the spoken label. For surfaces that own those
 * themselves and used the React Native component directly. Android is
 * passed straight through.
 */
export function PlainPressable({
  ref,
  feedback,
  ...props
}: PressableProps & { ref?: Ref<View>; feedback?: PressFeedback }) {
  const style = usePressedStyle(feedback, props.style);
  if (Platform.OS !== 'ios') return <NativePressable {...props} ref={ref} />;
  return (
    <NativePressable
      {...props}
      ref={ref}
      unstable_pressDelay={props.unstable_pressDelay ?? IOS_PRESS_DELAY}
      style={style}
    />
  );
}
function AndroidPressable({
  ref,
  ringed = false,
  ...props
}: PressableProps & { ref?: Ref<View>; ringed?: boolean }) {
  const colors = useColors();

  const ownRef = useRef<View>(null);
  const setRef = useCallback(
    (node: View | null) => {
      ownRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const contrast = useHighTextContrast();
  const { style, children, android_ripple } = props;
  const disabled = props.disabled || props.accessibilityState?.disabled;
  const resting = StyleSheet.flatten(
    typeof style === 'function' ? style({ pressed: false }) : style,
  );
  const filledRoles: Role[] = [
    'navy',
    'navyRaised',
    'danger',
    ...Object.values(accents).map((accent) => accent.ink),
  ];
  const onFilled = filledRoles.some(
    (role) => colors[role] === resting?.backgroundColor,
  );
  const ripples = androidRipples(colors);
  const borderless = android_ripple?.borderless === true;
  // Absolutely positioned surfaces (chart bars, scrims) are sized by their
  // parent; a minimum there would overlap neighbours instead of growing a row.
  const minimum = resting?.position === 'absolute' ? 0 : androidControls.target;
  return (
    <NativePressable
      {...props}
      disabled={disabled}
      ref={setRef}
      onPressIn={(event) => {
        ownRef.current?.measureInWindow((x, y, width, height) =>
          rememberMenuAnchor({ x, y, width, height }),
        );
        props.onPressIn?.(event);
      }}
      android_ripple={
        disabled
          ? undefined
          : ringed
            ? // The ripple's own focused state draws a grey fill under the
              // navy ring. A transparent ripple keeps a focus-aware
              // foreground, so Android's default focus highlight stays off
              // too: one ring, not two.
              { color: 'transparent', foreground: true, borderless: false }
            : {
                color: onFilled
                  ? ripples.rippleOnFilled
                  : contrast
                    ? ripples.rippleHighContrast
                    : ripples.ripple,
                foreground: true,
                borderless: false,
                ...android_ripple,
              }
      }
      style={[
        resting,
        {
          minHeight: Math.max(
            minimum,
            typeof resting?.minHeight === 'number' ? resting.minHeight : 0,
          ),
          minWidth: Math.max(
            minimum,
            typeof resting?.minWidth === 'number' ? resting.minWidth : 0,
          ),
          ...(borderless ? {} : { overflow: 'hidden' }),
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed: false }) : children}
    </NativePressable>
  );
}
