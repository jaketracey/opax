import { Pressable } from './pressable';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ownsRowPadding,
  useRowCellStyle,
  useRowHighlight,
} from './row-padding';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useAccessibilitySize, useReduceMotion } from './accessibility';
import { Icon, type SFSymbol } from './icon';
import { HeightReveal } from './reveal';
import { Text } from './text';
import { minimumTarget, rhythm, type Accent } from './tokens';

/**
 * A native disclosure row: label, an optional value on the right ("12",
 * "$48,210") and a chevron that turns down when open. It replaces stacks of
 * bordered "Show…" buttons. VoiceOver hears the label and "expanded" or
 * "collapsed". The body is built only while open; it eases open and closed
 * in a HeightReveal (at once with Reduce Motion), so the rows below slide
 * rather than jump.
 */
export function Disclosure({
  label = 'More',
  value,
  detail,
  icon,
  accent: _accent,
  accessibilityLabel,
  testID,
  bodyTestID,
  defaultOpen = false,
  open: controlled,
  onToggle,
  accessory,
  children,
}: {
  label?: string;
  /** A short trailing value: a count or a total. Never wraps. */
  value?: string;
  /** A line under the label: "Parliament of Australia · CC BY-NC-ND". */
  detail?: string;
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
  /** A separate control beside the disclosure, outside its tap target. */
  accessory?: ReactNode;
  children: ReactNode | (() => ReactNode);
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const reduceMotion = useReduceMotion();
  const stacked = useAccessibilitySize();
  const cellStyle = useRowCellStyle();
  const highlight = useRowHighlight();
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
  const tint = 'inkSoft';
  const header = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? [label, value, detail].filter(Boolean).join(', ')
      }
      accessibilityState={{ expanded: open }}
      testID={testID}
      onPress={() => {
        const next = !open;
        if (controlled === undefined) setOwn(next);
        onToggle?.(next);
      }}
      style={({ pressed }) => [
        styles.row,
        cellStyle,
        accessory ? styles.withAccessory : null,
        pressed ? { backgroundColor: highlight } : null,
      ]}
    >
      {icon ? <Icon name={icon} size={17} tone={tint} /> : null}
      <View
        style={[
          styles.text,
          accessory ? styles.intrinsicText : styles.fillText,
          stacked ? styles.stacked : null,
        ]}
      >
        <View style={styles.label}>
          <Text wordSafe variant="strong">
            {label}
          </Text>
          {detail ? (
            <Text wordSafe variant="secondary">
              {detail}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant="strong" tabular tone="inkSoft" style={styles.value}>
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
                outputRange: ['0deg', '180deg'],
              }),
            },
          ],
        }}
      >
        <Icon
          name={disclosureChevron}
          size={13}
          maxScale={1.5}
          tone="inkFaint"
        />
      </Animated.View>
    </Pressable>
  );
  return (
    <View>
      {accessory ? (
        <View style={styles.header}>
          {header}
          <View style={styles.accessory}>{accessory}</View>
        </View>
      ) : (
        header
      )}
      <HeightReveal reduceMotion={reduceMotion}>
        {open ? (
          <View
            style={styles.body}
            testID={bodyTestID ?? (testID ? `${testID}-body` : undefined)}
          >
            {typeof children === 'function' ? children() : children}
          </View>
        ) : null}
      </HeightReveal>
    </View>
  );
}

const disclosureChevron = 'chevron.down';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: rhythm.tight,
  },
  withAccessory: { flexGrow: 1, flexShrink: 0, maxWidth: '100%' },
  accessory: {
    marginLeft: 'auto',
    maxWidth: '100%',
    paddingVertical: rhythm.tight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rhythm.tight,
    minHeight: minimumTarget,
    paddingVertical: rhythm.row,
  },
  text: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: rhythm.tight,
  },
  fillText: { flex: 1 },
  // Measure the label before deciding whether the accessory needs another line.
  intrinsicText: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  stacked: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 },
  label: { flexShrink: 1, flexGrow: 1, gap: 2 },
  value: { flexShrink: 0 },
  body: {
    paddingTop: rhythm.line,
    paddingBottom: rhythm.tight,
    gap: rhythm.block,
  },
});

ownsRowPadding(Disclosure);
