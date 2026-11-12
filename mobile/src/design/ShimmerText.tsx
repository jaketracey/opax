import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  useHighTextContrast,
  useIncreaseContrast,
  useReduceMotionSetting,
} from './accessibility';
import { darkHighContrast, lightHighContrast, paletteFor } from './palette';
import { Text } from './text';
import { motion } from './tokens';

/** Native Text owns every glyph, wrapping, Dynamic Type and Bold Text.
 * Pulse its colour without a second drawing or reducing secondary contrast. */
export function ShimmerText({
  text,
  testID,
}: {
  text: string;
  testID?: string;
}) {
  const reduceMotion = useReduceMotionSetting();
  return (
    <View>
      <Text
        wordSafe
        variant="secondary"
        accessible
        accessibilityLabel={text}
        testID={testID}
      >
        {reduceMotion === false ? <NativePulse>{text}</NativePulse> : text}
      </Text>
    </View>
  );
}

function NativePulse({ children }: { children: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highContrast = useHighTextContrast();
  const palette = paletteFor(scheme);
  const strong = scheme === 'dark' ? darkHighContrast : lightHighContrast;
  const secondary =
    (contrast || highContrast ? strong.inkSoft : undefined) ?? palette.inkSoft;
  const highlight =
    (contrast || highContrast ? strong.ink : undefined) ?? palette.ink;
  const progress = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    color: interpolateColor(progress.get(), [0, 1], [secondary, highlight]),
  }));
  useEffect(() => {
    progress.set(0);
    // Increase Contrast can make both endpoints identical already.
    if (secondary === highlight) return;
    const timing = {
      duration: motion.duration.gentle * 2,
      easing: Easing.inOut(Easing.quad),
    };
    progress.set(
      withRepeat(
        withSequence(
          withTiming(1, timing),
          withTiming(0, timing),
          withDelay(motion.duration.standard, withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, secondary, highlight]);
  // An inline native span inherits the parent's typography and participates
  // in its attributed string. Only the parent is an accessibility element.
  return (
    <Animated.Text accessible={false} style={style}>
      {children}
    </Animated.Text>
  );
}
