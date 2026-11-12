import { useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { useReduceMotionSetting } from '../../design/accessibility';
import { motion } from '../../design/tokens';

/** Only content replacing a perceptible skeleton fades. Saved reads swap in place. */
export function useContentArrival(skeleton: boolean, content: boolean) {
  const [opacity] = useState(() => new Animated.Value(1));
  const skeletonSince = useRef<number | null>(null);
  const reduced = useReduceMotionSetting();
  useLayoutEffect(() => {
    if (skeleton) {
      skeletonSince.current ??= Date.now();
      opacity.setValue(1);
      return;
    }
    const since = skeletonSince.current;
    skeletonSince.current = null;
    if (!content || since === null || Date.now() - since < 100) {
      opacity.setValue(1);
      return;
    }
    const duration = reduced === false ? motion.duration.crossfade : 0;
    opacity.setValue(duration ? 0 : 1);
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });
    fade.start();
    return () => {
      fade.stop();
      opacity.setValue(1);
    };
  }, [skeleton, content, reduced, opacity]);
  return opacity;
}
