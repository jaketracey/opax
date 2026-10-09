import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { androidSymbol } from '../../design/android-symbols';
import { calendarDate, formatDate } from '../../design/format';
import { SourceLine, useReduceMotionSetting } from '../../design/primitives';

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
  color: ColorValue;
}) {
  const { fontScale } = useWindowDimensions();
  const scaled = Math.round(size * Math.min(Math.max(fontScale, 1), 2));
  return (
    <SymbolView
      name={Platform.OS === 'android' ? { android: androidSymbol(name) } : name}
      size={Platform.OS === 'android' ? scaled / fontScale : scaled}
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
 * @deprecated Use `SourceLine`. The one source line under a Today block:
 * when its record was last updated ("Updated 4 Oct"), and the saved date
 * when it is a saved copy, opening the source sheet.
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
  return (
    <SourceLine
      asOf={asAt}
      dateLabel={asAt ? `Updated ${shortDay(asAt)}` : 'Date not published'}
      savedAt={savedAt}
      testID={testID}
    />
  );
}
