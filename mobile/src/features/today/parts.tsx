import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { calendarDate, formatDate } from '../../design/format';
import { useReduceMotionSetting } from '../../design/primitives';

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

/** "4 Oct" this year, "4 Oct 2025" before it. */
export function shortDay(value: string | number | Date): string {
  const day = calendarDate(value);
  const text = formatDate(value, 'short');
  return day && day.year === new Date().getFullYear()
    ? text.replace(/ \d{4}$/, '')
    : text;
}

/**
 * A date the publisher wrote out ("12 Aug 2026"), without this year's year:
 * "12 Aug". Any other year, or a date in another shape, stays as written.
 */
export function shortWrittenDay(value: string, now = new Date()): string {
  return value.replace(new RegExp(` ${now.getFullYear()}$`), '');
}
