import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  StyleSheet,
} from 'react-native';
import { colors } from '../design/tokens';
import {
  hideNativeSplash,
  splashPhase,
  splashReleased,
  subscribeSplash,
} from './splash';
import { handoff, lockup } from './timing';

/**
 * The launch cover: the native splash's image drawn in the same place on
 * paper, so hiding the native splash shows no seam, then one crossfade of
 * 240 ms (motion.launch) to what is underneath. No rule, no hold. Content is
 * mounted and touchable underneath from the first frame: the cover takes no
 * touches and is hidden from VoiceOver. Reduce Motion: a cut.
 *
 * `latest`: fade at `handoff.latestFade` even if `ready` never comes (a
 * returning launch). Without it the cover holds until `ready`, or the
 * splash failsafe. `instant`: the cover is already hidden under the
 * welcome's full-screen modal, so it goes without a fade.
 */
export function LaunchHandoff({
  ready,
  latest = false,
  instant = false,
  onDone,
  testID = 'launch-handoff',
}: {
  ready: boolean;
  latest?: boolean;
  instant?: boolean;
  onDone: () => void;
  testID?: string;
}) {
  const [drawn, setDrawn] = useState(false);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const shownAt = useRef(0);
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

  // The image is on screen: hide the native splash under it.
  useEffect(() => {
    if (!drawn || reduced === null) return;
    hideNativeSplash();
    shownAt.current = Date.now();
  }, [drawn, reduced]);

  useEffect(() => {
    if (!drawn || reduced === null) return;
    const fade = () => {
      if (fading.current) return;
      fading.current = true;
      Animated.timing(veil, {
        toValue: 0,
        duration: instant || reduced ? handoff.reducedFade : handoff.fade,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => onDone());
    };
    const elapsed = Date.now() - shownAt.current;
    if (ready) {
      const timer = setTimeout(
        fade,
        Math.max(0, fadeAfter(elapsed, reduced) - elapsed),
      );
      return () => clearTimeout(timer);
    }
    if (!latest) return;
    const timer = setTimeout(fade, Math.max(0, handoff.latestFade - elapsed));
    return () => clearTimeout(timer);
  }, [drawn, reduced, ready, latest, instant, veil, onDone]);

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.veil, { opacity: veil }]}
    >
      <Image
        source={require('../../assets/splash/splash.png')}
        style={styles.image}
        fadeDuration={0}
        onLoad={() => setDrawn(true)}
        onError={() => setDrawn(true)}
      />
    </Animated.View>
  );
}
function fadeAfter(elapsed: number, reduced: boolean) {
  return reduced ? elapsed : Math.min(handoff.latestFade, elapsed);
}

/** The root's cover, driven by the launch decision in splash.ts. */
export function RootLaunchHandoff({ onDone }: { onDone: () => void }) {
  const released = useSyncExternalStore(
    subscribeSplash,
    splashReleased,
    splashReleased,
  );
  const phase = useSyncExternalStore(subscribeSplash, splashPhase, splashPhase);
  return (
    <LaunchHandoff
      ready={released}
      latest={phase === 'plain'}
      // Under the welcome the cover is already out of sight: the welcome
      // draws its own copy of the splash and dissolves that instead.
      instant={phase === 'welcome' && released}
      onDone={onDone}
    />
  );
}

const styles = StyleSheet.create({
  veil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: lockup.width, height: lockup.height },
});
