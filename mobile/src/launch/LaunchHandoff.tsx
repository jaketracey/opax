import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../design/tokens';
import { hideNativeSplash } from './splash';
import { fadeStart, handoff, lockup } from './timing';

/**
 * The launch splash, handed over. It draws the native splash's image in the
 * same place, so hiding the native one shows no seam. A bronze hairline
 * draws out under the wordmark, a broadsheet masthead rule, as the veil
 * fades to the first screen the moment it is ready (src/launch/timing.ts
 * has the beats; at most 1.2 s). Content is mounted and touchable underneath from the first frame:
 * the veil takes no touches and is hidden from VoiceOver. Reduce Motion: no
 * rule, only a short fade.
 */
export function LaunchHandoff({
  ready,
  onDone,
}: {
  /** The first screen (Today or the welcome tour) has rendered. */
  ready: boolean;
  onDone: () => void;
}) {
  const [drawn, setDrawn] = useState(false);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const shownAt = useRef(0);
  const rule = useState(() => new Animated.Value(0))[0];
  const veil = useState(() => new Animated.Value(1))[0];
  const fading = useRef(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => active && setReduced(value),
      () => active && setReduced(true),
    );
    return () => {
      active = false;
    };
  }, []);

  // The image is on screen: hide the native splash under it, then draw.
  useEffect(() => {
    if (!drawn || reduced === null) return;
    hideNativeSplash();
    shownAt.current = Date.now();
    if (!reduced)
      Animated.timing(rule, {
        toValue: 1,
        duration: handoff.rule,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
  }, [drawn, reduced, rule]);

  useEffect(() => {
    if (!drawn || reduced === null) return;
    const fade = () => {
      if (fading.current) return;
      fading.current = true;
      Animated.timing(veil, {
        toValue: 0,
        duration: reduced ? handoff.reducedFade : handoff.fade,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => onDone());
    };
    const elapsed = Date.now() - shownAt.current;
    const wait = ready
      ? fadeStart(elapsed, reduced) - elapsed
      : handoff.latestFade - elapsed;
    const timer = setTimeout(fade, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [drawn, reduced, ready, veil, onDone]);

  return (
    <Animated.View
      testID="launch-handoff"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.veil, { opacity: veil }]}
    >
      <View style={styles.lockup}>
        <Image
          source={require('../../assets/splash/splash.png')}
          style={styles.image}
          fadeDuration={0}
          onLoad={() => setDrawn(true)}
          onError={() => setDrawn(true)}
        />
        <Animated.View
          style={[styles.rule, { transform: [{ scaleX: rule }] }]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: { width: lockup.width, height: lockup.height },
  image: { width: lockup.width, height: lockup.height },
  rule: {
    position: 'absolute',
    top: lockup.ruleTop,
    left: (lockup.width - lockup.ruleWidth) / 2,
    width: lockup.ruleWidth,
    height: 1,
    backgroundColor: colors.bronze,
  },
});
