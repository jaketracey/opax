import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { Icon, type SFSymbol } from './icon';
import { Text } from './text';
import { accents, colors, minimumTarget, rhythm, type Accent } from './tokens';

/** Expand and collapse smoothly, or instantly with Reduce Motion. */
export function animateLayout(reduceMotion: boolean) {
  if (reduceMotion) return;
  LayoutAnimation.configureNext(
    LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'),
  );
}

/**
 * A native disclosure row: label, an optional value on the right ("12",
 * "$48,210") and a chevron that turns down when open. It replaces stacks of
 * bordered "Show…" buttons. VoiceOver hears the label and "expanded" or
 * "collapsed". The body is built only while open.
 */
export function Disclosure({
  label,
  value,
  icon,
  accent,
  accessibilityLabel,
  testID,
  bodyTestID,
  defaultOpen = false,
  open: controlled,
  onToggle,
  children,
}: {
  label: string;
  /** A short trailing value: a count or a total. */
  value?: string;
  /** A leading SF Symbol, tinted with the accent. */
  icon?: SFSymbol;
  accent?: Accent;
  accessibilityLabel?: string;
  testID?: string;
  bodyTestID?: string;
  defaultOpen?: boolean;
  /** Controlled state; leave unset for a self-contained disclosure. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode | (() => ReactNode);
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const reduceMotion = useReduceMotion();
  const stacked = useAccessibilitySize();
  // One animated value for the row's lifetime (state, not a ref, so render reads it).
  const [turn] = useState(() => new Animated.Value(open ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) turn.setValue(open ? 1 : 0);
    else
      Animated.timing(turn, {
        toValue: open ? 1 : 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
  }, [open, reduceMotion, turn]);
  const tint = accent ? accents[accent].ink : 'navy';
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          accessibilityLabel ?? (value ? `${label}, ${value}` : label)
        }
        accessibilityState={{ expanded: open }}
        testID={testID}
        onPress={() => {
          animateLayout(reduceMotion);
          const next = !open;
          if (controlled === undefined) setOwn(next);
          onToggle?.(next);
        }}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: colors.sunken } : null,
        ]}
      >
        {icon ? <Icon name={icon} size={17} tone={tint} /> : null}
        <View style={[styles.text, stacked ? styles.stacked : null]}>
          <Text wordSafe variant="strong" style={styles.label}>
            {label}
          </Text>
          {value ? (
            <Text variant="figureInline" tone="inkSoft">
              {value}
            </Text>
          ) : null}
        </View>
        <Animated.View
          style={{
            transform: [
              {
                rotate: turn.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '90deg'],
                }),
              },
            ],
          }}
        >
          <Icon name="chevron.right" size={13} tone="inkSoft" />
        </Animated.View>
      </Pressable>
      {open ? (
        <View
          style={styles.body}
          testID={bodyTestID ?? (testID ? `${testID}-body` : undefined)}
        >
          {typeof children === 'function' ? children() : children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.tight,
  },
  text: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  label: { flexShrink: 1, flexGrow: 1 },
  body: {
    paddingTop: rhythm.line,
    paddingBottom: rhythm.tight,
    gap: rhythm.block,
  },
});
