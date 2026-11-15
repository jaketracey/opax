import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useReduceMotion } from './accessibility';
import { motion } from './tokens';

/** The outgoing view's fade, then the incoming view's. */
export const FADE_THROUGH = {
  out: motion.duration.quick,
  in: motion.duration.crossfade,
  easing: Easing.bezier(...motion.easing.standard),
} as const;

/**
 * A switch between two whole views of one page (Money's Map and List) that
 * fades through instead of cutting: the view on screen fades out, the choice
 * is applied, and the new view fades in. The control that made the choice
 * shows it at once (`target`), so its own selection moves under the finger
 * while the page follows. With Reduce Motion the choice is applied at once
 * and nothing fades.
 *
 * The page sits in a `FadeThroughHost`, the one wrapper whichever view is
 * drawn in, so the fade carries across the swap; the page itself only calls
 * `useFadeThrough(apply)` and hands `choose` to its control. Only a choice
 * made here fades: the first view simply draws. Without a host the choice
 * is applied at once.
 */
type Switch = {
  target: unknown;
  choose: (next: unknown, current: unknown) => void;
  /** The page says how a choice is applied; returns the undo. */
  register: (apply: (next: never) => void) => () => void;
};
const FadeThroughContext = createContext<Switch | null>(null);

export function FadeThroughHost({ children }: { children: ReactNode }) {
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));
  const [target, setTarget] = useState<unknown>(null);
  const apply = useRef<((next: never) => void) | null>(null);
  // The choice being faded towards, and whether its view is now due in.
  const wanted = useRef<{ value: unknown } | null>(null);
  const [arriving, setArriving] = useState(0);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const choose = useCallback(
    (next: unknown, current: unknown) => {
      if (next === current && !wanted.current) return;
      setTarget(next);
      if (reduceMotion) {
        running.current?.stop();
        wanted.current = null;
        opacity.setValue(1);
        apply.current?.(next as never);
        return;
      }
      // A second choice mid-fade changes where the fade is heading.
      const fading = wanted.current !== null;
      wanted.current = { value: next };
      if (fading) return;
      running.current?.stop();
      const out = Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_THROUGH.out,
        easing: FADE_THROUGH.easing,
        useNativeDriver: true,
      });
      running.current = out;
      out.start(({ finished }) => {
        if (!finished || !wanted.current) return;
        const { value } = wanted.current;
        wanted.current = null;
        apply.current?.(value as never);
        setArriving((n) => n + 1);
      });
    },
    [opacity, reduceMotion],
  );
  // The new view has committed: bring it in.
  useEffect(() => {
    if (!arriving) return;
    const fade = Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_THROUGH.in,
      easing: FADE_THROUGH.easing,
      useNativeDriver: true,
    });
    running.current = fade;
    fade.start();
    return () => fade.stop();
  }, [arriving, opacity]);
  useEffect(() => () => running.current?.stop(), []);
  const register = useCallback((next: (value: never) => void) => {
    apply.current = next;
    return () => {
      if (apply.current === next) apply.current = null;
    };
  }, []);
  const value = { target, choose, register };
  return (
    <FadeThroughContext.Provider value={value}>
      <Animated.View testID="fade-through" style={[styles.fill, { opacity }]}>
        {children}
      </Animated.View>
    </FadeThroughContext.Provider>
  );
}

/** The page's side: how a choice is applied; what to show and call. */
export function useFadeThrough<T>(apply: (next: T) => void): {
  target: T | null;
  choose: (next: T, current: T | null) => void;
} {
  const host = useContext(FadeThroughContext);
  const register = host?.register;
  useEffect(
    () => register?.(apply as (next: never) => void),
    [register, apply],
  );
  const direct = useCallback((next: T) => apply(next), [apply]);
  return host
    ? { target: host.target as T | null, choose: host.choose }
    : { target: null, choose: direct };
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
