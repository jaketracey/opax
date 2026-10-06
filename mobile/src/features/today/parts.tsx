import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { calendarDate, formatDate } from '../../design/format';
import { partyDot, partyText, type PartyContext } from '../../design/party';
import { Text, useReduceMotionSetting } from '../../design/primitives';
import { colors, hairline, light, spacing } from '../../design/tokens';
import { markOn, washOf } from './tint';

/** Today's cards: continuous 16pt corners on the raised surface. */
export const cardRadius = 16;

/** A raised card with a hairline edge. `ground` replaces the raised surface. */
export function TodayCard({
  children,
  ground,
  style,
  testID,
}: {
  children: ReactNode;
  ground?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[styles.card, ground ? { backgroundColor: ground } : null, style]}
    >
      {children}
    </View>
  );
}

/**
 * Rises and fades in once, when it first mounts. Nothing moves before iOS
 * has answered the Reduce Motion setting, and with Reduce Motion on (or
 * turned on mid-way) the finished state shows at once.
 */
export function Entrance({
  order = 0,
  children,
  style,
}: {
  order?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReduceMotionSetting();
  const shown = useState(() => new Animated.Value(reduced === true ? 1 : 0))[0];
  const done = useRef(false);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (reduced === null) return;
    if (reduced) {
      running.current?.stop();
      running.current = null;
      done.current = true;
      shown.setValue(1);
      return;
    }
    if (done.current) return;
    done.current = true;
    const reveal = Animated.timing(shown, {
      toValue: 1,
      duration: 460,
      delay: Math.min(order, 6) * 70,
      easing: Easing.bezier(0.2, 0, 0, 1),
      useNativeDriver: true,
    });
    running.current = reveal;
    reveal.start(() => {
      if (running.current === reveal) running.current = null;
    });
  }, [reduced, order, shown]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: shown,
          transform: [
            {
              translateY: shown.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** An SF Symbol in any Today colour, scaled with text as the design system's Icon is. */
export function TintIcon({
  name,
  size = 16,
  color,
}: {
  name: SFSymbol;
  size?: number;
  color: string;
}) {
  const { fontScale } = useWindowDimensions();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), 2));
  return (
    <SymbolView
      name={name}
      size={scaled}
      tintColor={color}
      style={{ width: scaled, height: scaled }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** "4 Oct" this year, "4 Oct 2025" before it. */
export function shortDay(value: string | number | Date): string {
  const day = calendarDate(value);
  const text = formatDate(value, 'short');
  return day && day.year === new Date().getFullYear()
    ? text.replace(/ \d{4}$/, '')
    : text;
}

/**
 * The one quiet caption under a Today block: when its record was last
 * updated, and the saved date when it is a saved copy. No source names.
 */
export function UpdatedCaption({
  asAt,
  savedAt,
  testID,
}: {
  asAt: string | null;
  savedAt?: number | null;
  testID?: string;
}) {
  const parts = [
    asAt ? `Updated ${shortDay(asAt)}` : 'Date not published',
    savedAt != null ? `Saved ${shortDay(savedAt)}` : null,
  ].filter(Boolean);
  return (
    <Text wordSafe variant="fine" testID={testID}>
      {parts.join(' · ')}
    </Text>
  );
}

/** A small rounded label on a tinted ground: a category, a status or a topic. */
export function Chip({
  label,
  ground,
  color = light.ink,
  dot,
  icon,
  testID,
}: {
  label: string;
  ground: string;
  /** Opaque hex: tests/today-tint.test.ts checks it on its ground. */
  color?: string;
  dot?: string | null;
  icon?: SFSymbol;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.chip, { backgroundColor: ground }]}>
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      {icon ? <TintIcon name={icon} size={12} color={color} /> : null}
      <Text
        wordSafe
        variant="tag"
        accessible={false}
        style={[styles.chipText, { color }]}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * A party in a dense row: the dot, the web's short label (ALP, LIB) and its
 * status in words ("Formerly ALP"), on a light wash of the party colour. The
 * row around it carries the full spoken name.
 */
export function PartyChip({
  party,
  status,
  formerly,
  testID,
}: PartyContext & { testID?: string }) {
  const dot = partyDot(party);
  const text = partyText({ party, status, formerly }, true);
  const ground = dot ? washOf(dot, 0.14) : light.sunken;
  return (
    <Chip
      label={
        text.previous ? `${text.visible} · ${text.previous}` : text.visible
      }
      ground={ground}
      dot={dot ? markOn(dot, ground) : null}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.raised,
    borderRadius: cardRadius,
    borderCurve: 'continuous',
    borderWidth: hairline,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.s1 + 1,
    paddingHorizontal: spacing.s3,
    paddingVertical: 3,
    borderRadius: 999,
    maxWidth: '100%',
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { flexShrink: 1 },
});
