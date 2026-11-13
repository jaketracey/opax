import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion } from './tokens';

export const revealMotion = {
  duration: motion.duration.standard,
  easing: Easing.bezier(...motion.easing.standard),
} as const;

/**
 * A short line or block that comes and goes under a control (the first
 * follow's "Changes will show on Today.", the follow limit, a save error).
 * Its height opens over 200 ms with the standard ease, so the content below
 * eases down rather than jumping, and closes the same way before the content
 * is removed. With Reduce Motion it takes and gives up its height in one
 * step. Content that was open at mount shows at once.
 *
 * The height is animated by Reanimated, not LayoutAnimation. Reanimated 4.5
 * installs its own layout-animation delegate on Fabric's UIManager
 * (LayoutAnimationsProxy_Legacy), and that delegate ignores
 * `configureNextLayoutAnimation`, so LayoutAnimation.configureNext does
 * nothing and the rows below moved in a single frame (build 61, bug 4).
 */
export function HeightReveal({
  children,
  reduceMotion,
  testID,
}: {
  /** The content; null or false closes the reveal. */
  children: ReactNode;
  reduceMotion: boolean;
  testID?: string;
}) {
  const open = children != null && children !== false;
  // The last open content, kept drawn while the height closes over it.
  const [kept, setKept] = useState<ReactNode>(open ? children : null);
  const [measured, setMeasured] = useState(0);
  if (open && kept !== children) setKept(children);
  // Nothing to animate (Reduce Motion, or never measured): it goes at once.
  if (!open && kept != null && (reduceMotion || !measured)) {
    setKept(null);
    setMeasured(0);
  }
  // Content open at mount takes its height without animating.
  const instant = useRef(open);
  const height = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(height);
    // Closed, or waiting for the content's own height before opening.
    if (!measured) {
      height.value = 0;
      return;
    }
    const to = open ? measured : 0;
    if (reduceMotion || instant.current) {
      instant.current = false;
      height.value = to;
      return;
    }
    height.value = withTiming(to, revealMotion);
    if (open) return;
    const timer = setTimeout(() => {
      setKept(null);
      setMeasured(0);
    }, revealMotion.duration);
    return () => clearTimeout(timer);
  }, [open, measured, reduceMotion, height]);
  const style = useAnimatedStyle(() => ({ height: height.value }));
  if (kept == null) return null;
  return (
    <Reanimated.View style={[styles.clip, style]} testID={testID}>
      <View
        collapsable={false}
        testID={testID ? `${testID}-content` : undefined}
        onLayout={(event: LayoutChangeEvent) => {
          const next = Math.ceil(event.nativeEvent.layout.height);
          if (next > 0) setMeasured(next);
        }}
      >
        {open ? children : kept}
      </View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  // 'scroll' clips exactly as 'hidden' does (iOS clipsToBounds, Android's
  // clip bounds), but Yoga then lays the content out at its own height. Under
  // 'hidden' a column fits its children to its own height, so content in a
  // 0-high reveal measured 0 and the reveal never opened (b62 device check).
  clip: { overflow: 'scroll' },
});
