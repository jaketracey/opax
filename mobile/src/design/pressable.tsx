import { useRef, type Ref } from 'react';
import {
  Platform,
  Pressable as NativePressable,
  StyleSheet,
  type PressableProps,
  type View,
} from 'react-native';
import { useHighTextContrast } from './accessibility';
import { rememberMenuAnchor } from './menu-anchor';
import { accents, colors, androidControls, type Role } from './tokens';

/** The shared touch surface. iOS receives exactly its original native props. */
export function Pressable({
  ref,
  ...props
}: PressableProps & { ref?: Ref<View> }) {
  return Platform.OS === 'android' ? (
    <AndroidPressable ref={ref} {...props} />
  ) : (
    <NativePressable ref={ref} {...props} />
  );
}
function AndroidPressable({
  ref,
  ...props
}: PressableProps & { ref?: Ref<View> }) {
  const ownRef = useRef<View>(null);
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
  const minimum = androidControls.target;
  return (
    <NativePressable
      {...props}
      disabled={disabled}
      ref={(node) => {
        ownRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      onPressIn={(event) => {
        ownRef.current?.measureInWindow((x, y, width, height) =>
          rememberMenuAnchor({ x, y, width, height }),
        );
        props.onPressIn?.(event);
      }}
      android_ripple={
        disabled
          ? undefined
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
