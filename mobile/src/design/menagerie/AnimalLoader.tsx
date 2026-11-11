import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg from 'react-native-svg';
import {
  useHighTextContrast,
  useIncreaseContrast,
  useReduceMotionSetting,
} from '../accessibility';
import { darkHighContrast, lightHighContrast, paletteFor } from '../palette';
import { colors } from '../tokens';
import { AnimalDrawing } from './animals';
import {
  ANIMAL_WIDTH,
  AnimalMotion,
  CYCLE_MS,
  ON_STAGE_PHASE,
  STAGE_WIDTH,
  cyclePercent,
  walkPosition,
} from './motion';
import { animals, type AnimalName } from './poses';

/** A decorative companion for Ask waits. Unknown motion settings stand still. */
export const AnimalLoader = memo(function AnimalLoader({
  animal,
  phase = ON_STAGE_PHASE,
}: {
  animal?: AnimalName;
  phase?: number;
}) {
  const [name] = useState(
    () => animal ?? animals[Math.floor(Math.random() * animals.length)]!,
  );
  const still = useReduceMotionSetting() !== false;
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const contrast = useIncreaseContrast();
  const highContrast = useHighTextContrast();
  const palette = paletteFor(scheme);
  const ink =
    (contrast || highContrast
      ? (scheme === 'dark' ? darkHighContrast : lightHighContrast).bronzeInk
      : undefined) ?? palette.bronzeInk;
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.value = 0;
    if (!still)
      clock.value = withRepeat(
        withTiming(1, {
          duration: CYCLE_MS,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      );
    return () => cancelAnimation(clock);
  }, [clock, still]);
  const walking = useAnimatedStyle(() => {
    const x = still
      ? (STAGE_WIDTH - ANIMAL_WIDTH) / 2
      : walkPosition(cyclePercent(clock.value, phase));
    return {
      transform: [{ translateX: x }],
      opacity: still
        ? 1
        : Math.max(
            0,
            Math.min(1, (x + ANIMAL_WIDTH) / 30, (STAGE_WIDTH - x) / 30),
          ),
    };
  });
  const motion = useMemo(
    () => ({ clock, name, phase, still }),
    [clock, name, phase, still],
  );
  return (
    <View
      testID="ask-animal"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.stage}
    >
      <View style={styles.ground} />
      <Animated.View style={[styles.animal, walking]} testID="ask-animal-pose">
        <AnimalMotion.Provider value={motion}>
          <Svg width={65} height={42} viewBox="0 0 120 78" accessible={false}>
            <AnimalDrawing name={name} ink={ink} wash={palette.bronzeWash} />
          </Svg>
        </AnimalMotion.Provider>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    width: STAGE_WIDTH,
    height: 48,
    overflow: 'hidden',
    backgroundColor: colors.paper,
  },
  ground: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.dividerDefault,
    opacity: 0.4,
  },
  animal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: ANIMAL_WIDTH,
    height: 42,
  },
});
