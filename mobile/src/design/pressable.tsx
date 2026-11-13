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
import { accents, border, colors, androidControls, type Role } from './tokens';

/** The shared touch surface; keyboard focus adds a layout-neutral outline. */
export function Pressable({
  ref,
  ...props
}: PressableProps & { ref?: Ref<View> }) {
  const [focused, setFocused] = useState(false);
  const { style } = props;
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
      {...(Platform.OS === 'android' ? { ringed } : null)}
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
function AndroidPressable({
  ref,
  ringed = false,
  ...props
}: PressableProps & { ref?: Ref<View>; ringed?: boolean }) {
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
                  ? androidControls.rippleOnFilled
                  : contrast
                    ? androidControls.rippleHighContrast
                    : androidControls.ripple,
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
