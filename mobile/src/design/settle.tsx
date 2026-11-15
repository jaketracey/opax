import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReduceMotionSetting } from './accessibility';
import { motion } from './tokens';

/**
 * A drawn figure settling into place once: a vote bar filling to its share,
 * a bill's rail drawing through the stages it has reached. The words and
 * numbers beside it are final from the first frame; only the decorative
 * mark moves, by transform alone, so nothing changes size or position.
 *
 * It runs once per `key` per session, the first time that record's figure
 * is drawn. Drawn again (a row scrolled back, a page reopened), with Reduce
 * Motion on or not yet known, or with no key, the figure is simply there.
 */
const settled = new Set<string>();

/** Test hook: forget which figures have settled this session. */
export function resetSettleForTests() {
  settled.clear();
}

export interface SettleOptions {
  duration?: number;
  /** A beat for the page's own arrival to finish first. */
  delay?: number;
  /** One eased sweep, or an even pace for marks that draw in turn. */
  easing?: 'out' | 'linear';
}

/**
 * Progress from 0 to 1 for the figure named `key`, or null when it is drawn
 * at rest: callers draw their plain, unanimated mark for null.
 */
export function useSettle(
  key: string | null | undefined,
  {
    duration = motion.duration.gentle,
    delay = 0,
    easing = 'out',
  }: SettleOptions = {},
): Animated.Value | null {
  const reduced = useReduceMotionSetting();
  // Decided once, at mount: nothing starts moving after it has been seen.
  const [progress] = useState(() =>
    key && reduced === false && !settled.has(key)
      ? new Animated.Value(0)
      : null,
  );
  useEffect(() => {
    // Drawn at rest before the setting was known is still seen: it must not
    // start moving when it is drawn again. Reduce Motion on does not use up
    // the figure's one settle.
    if (key && reduced === null) settled.add(key);
    if (!progress || !key) return;
    settled.add(key);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: easing === 'linear' ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
    // Mount only: the figure settles once, whatever changes later.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Reduce Motion turned on mid-settle: finish at once.
  useEffect(() => {
    if (progress && reduced) {
      progress.stopAnimation();
      progress.setValue(1);
    }
  }, [progress, reduced]);
  return progress;
}
