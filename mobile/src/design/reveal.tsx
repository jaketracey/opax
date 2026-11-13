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

/** The clip's limit at rest: none, so the content sets its own height. */
export const REVEAL_UNLIMITED = 1_000_000;

type Phase = 'rest' | 'opening' | 'closing';

/**
 * Content that comes and goes in place: a line under a control (the first
 * follow's "Changes will show on Today."), a disclosure's body, a vote's
 * detail, a list's further rows. Its height opens over 200 ms with the
 * standard ease, so the content below eases down rather than jumping, and
 * closes the same way before the content is removed. With Reduce Motion it
 * takes and gives up its height in one step.
 *
 * At rest it adds nothing: content open at mount draws at once at its own
 * height, nothing is clipped (rows keep their bleeding highlight), and a
 * later change of the content's height applies directly, as in any view.
 * Only while the height moves is the content clipped and its height capped.
 *
 * The height is animated by Reanimated, not LayoutAnimation. Reanimated 4.5
 * installs its own layout-animation delegate on Fabric's UIManager
 * (LayoutAnimationsProxy_Legacy), and that delegate ignores
 * `configureNextLayoutAnimation`, so LayoutAnimation.configureNext does
 * nothing and the rows below moved in a single frame (build 61, bug 4).
 * scripts/qa-static.ts refuses new LayoutAnimation calls.
 */
export function HeightReveal({
  children,
  reduceMotion,
  gap = 0,
  testID,
}: {
  /** The content; null or false closes the reveal. */
  children: ReactNode;
  reduceMotion: boolean;
  /**
   * The parent's gap after this reveal. It is folded into the reveal, so the
   * content below moves by the content and the gap together, smoothly,
   * instead of jumping by the gap as the reveal starts opening or finishes
   * closing. At rest the spacing is the parent's gap, as before.
   */
  gap?: number;
  testID?: string;
}) {
  const open = children != null && children !== false;
  // The last open content, kept drawn while the height closes over it.
  const [kept, setKept] = useState<ReactNode>(open ? children : null);
  // The content's own height, once laid out (0: not yet).
  const [measured, setMeasured] = useState(0);
  // Content open at mount is at rest: no animation, nothing clipped.
  const [phase, setPhase] = useState<Phase>('rest');
  const [wasOpen, setWasOpen] = useState(open);
  if (open && kept !== children) setKept(children);
  let next = phase;
  if (open !== wasOpen) {
    setWasOpen(open);
    next = open ? 'opening' : 'closing';
  }
  if (reduceMotion && next === 'opening') next = 'rest';
  // Nothing to animate (Reduce Motion, or never measured): it goes at once.
  if (next === 'closing' && (reduceMotion || !measured)) {
    next = 'rest';
    if (kept != null) setKept(null);
    if (measured) setMeasured(0);
  }
  if (next !== phase) setPhase(next);
  useEffect(() => {
    // Waiting for the content's own height before the clock starts.
    if (phase === 'rest' || !measured) return;
    const timer = setTimeout(() => {
      if (phase === 'closing') {
        setKept(null);
        setMeasured(0);
      }
      setPhase('rest');
    }, revealMotion.duration);
    return () => clearTimeout(timer);
  }, [phase, measured]);
  if (kept == null) return null;
  return (
    <RevealClip
      phase={phase}
      measured={measured}
      gap={gap}
      testID={testID}
      onMeasure={setMeasured}
    >
      {open ? children : kept}
    </RevealClip>
  );
}

/**
 * The clip, mounted with its content, so its limit starts right in the first
 * frame: none for content shown at once, 0 for content about to open.
 */
function RevealClip({
  phase,
  measured,
  gap,
  testID,
  onMeasure,
  children,
}: {
  phase: Phase;
  measured: number;
  gap: number;
  testID?: string;
  onMeasure: (height: number) => void;
  children: ReactNode;
}) {
  const limit = useSharedValue(phase === 'rest' ? REVEAL_UNLIMITED : 0);
  const settled = useRef(phase === 'rest');
  useEffect(() => {
    const wasSettled = settled.current;
    settled.current = phase === 'rest';
    if (phase === 'rest') {
      // Already unlimited: content changing height at rest costs nothing.
      if (wasSettled) return;
      cancelAnimation(limit);
      limit.value = REVEAL_UNLIMITED;
      return;
    }
    // Opening content stays at 0 until it has measured.
    if (!measured) return;
    if (phase === 'opening') {
      limit.value = withTiming(measured, revealMotion);
      return;
    }
    // Closing from rest starts at the content's own height, not the
    // unlimited cap; closing mid-opening starts where the height is.
    if (wasSettled) limit.value = measured;
    limit.value = withTiming(0, revealMotion);
  }, [phase, measured, limit]);
  const style = useAnimatedStyle(() => ({ maxHeight: limit.value }));
  const moving = phase !== 'rest';
  const closing = phase === 'closing';
  return (
    <Reanimated.View
      style={[
        moving ? styles.clip : null,
        gap ? { marginBottom: -gap } : null,
        closing ? styles.inert : null,
        style,
      ]}
      // Going: no longer read or tapped.
      accessibilityElementsHidden={closing || undefined}
      importantForAccessibility={closing ? 'no-hide-descendants' : undefined}
      testID={testID}
    >
      <View
        collapsable={false}
        style={gap ? { paddingBottom: gap } : undefined}
        testID={testID ? `${testID}-content` : undefined}
        onLayout={(event: LayoutChangeEvent) => {
          const height = Math.ceil(event.nativeEvent.layout.height);
          if (height > 0) onMeasure(height);
        }}
      >
        {children}
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
  inert: { pointerEvents: 'none' },
});
