import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useReduceMotion } from './accessibility';
import { motion } from './tokens';

/**
 * How long a row waits for its page to leave before giving the highlight up:
 * a tap that opened nothing (a refused navigation) must not leave the row
 * lit. A push that starts later than this only loses the held highlight.
 */
export const PUSH_HIGHLIGHT_WAIT = 1000;
/** The deselect fade as the page returns, as a table row deselects. */
export const PUSH_HIGHLIGHT_FADE = {
  duration: motion.duration.standard + motion.duration.crossfade,
  easing: Easing.bezier(...motion.easing.standard),
} as const;

type Phase = 'rest' | 'held' | 'fading';

/**
 * iOS: a row that opens a page stays highlighted while the page pushes, and
 * the highlight fades as the reader comes back, so they see which row they
 * came from (as Settings and Mail do). Before, the highlight dropped at
 * touch-up, ahead of the push.
 *
 * `hold()` when the row's link opens. The highlight is the row's own pressed
 * style, so every kind of row looks as it does under a finger. It is given
 * up when the page regains focus: at once with Reduce Motion, otherwise by
 * fading a copy of the highlight colour laid over the row's ground. Outside
 * a navigator (a test, a sheet's plain content) nothing is held.
 */
export function usePushHighlight() {
  const navigation = useContext(NavigationContext);
  const reduceMotion = useReduceMotion();
  const [phase, setPhase] = useState<Phase>('rest');
  const [opacity] = useState(() => new Animated.Value(0));
  const stop = useRef<(() => void) | null>(null);
  const reduced = useRef(reduceMotion);
  useEffect(() => {
    reduced.current = reduceMotion;
  }, [reduceMotion]);
  const release = useCallback(() => {
    stop.current?.();
    stop.current = null;
    if (reduced.current) {
      setPhase('rest');
      return;
    }
    opacity.setValue(1);
    setPhase('fading');
    const fade = Animated.timing(opacity, {
      toValue: 0,
      ...PUSH_HIGHLIGHT_FADE,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) setPhase('rest');
    });
    stop.current = () => fade.stop();
  }, [opacity]);
  const hold = useCallback(() => {
    if (!navigation) return;
    stop.current?.();
    let left = false;
    const blur = navigation.addListener('blur', () => {
      left = true;
      clearTimeout(timer);
    });
    const focus = navigation.addListener('focus', () => {
      if (left) release();
    });
    // The page never left: nothing opened, so nothing is held.
    const timer = setTimeout(() => {
      if (!left) release();
    }, PUSH_HIGHLIGHT_WAIT);
    stop.current = () => {
      clearTimeout(timer);
      blur();
      focus();
    };
    setPhase('held');
  }, [navigation, release]);
  useEffect(
    () => () => {
      stop.current?.();
      stop.current = null;
    },
    [],
  );
  return { phase, opacity, hold };
}

/**
 * The row's style and children for the phase. The children keep one shape in
 * every phase (the fade's place, then the row's own), so the row's content
 * is never remounted as the highlight comes and goes.
 */
export function pushHighlightProps(
  {
    phase,
    opacity,
  }: Pick<ReturnType<typeof usePushHighlight>, 'phase' | 'opacity'>,
  style: PressableProps['style'],
  children: PressableProps['children'],
): Pick<PressableProps, 'style' | 'children'> {
  const at = (pressed: boolean) =>
    typeof style === 'function'
      ? style({ pressed } as PressableStateCallbackType)
      : style;
  let fade: ReactNode = null;
  if (phase === 'fading') {
    const lit = StyleSheet.flatten(at(true));
    const rest = StyleSheet.flatten(at(false));
    if (lit?.backgroundColor && lit.backgroundColor !== rest?.backgroundColor)
      fade = (
        <Animated.View
          testID="push-highlight-fade"
          style={[
            StyleSheet.absoluteFill,
            styles.fade,
            {
              backgroundColor: lit.backgroundColor,
              borderRadius: lit.borderRadius,
              borderCurve: 'continuous',
              opacity,
            },
          ]}
        />
      );
  }
  return {
    style:
      phase === 'held' && typeof style === 'function'
        ? (state) => style({ ...state, pressed: true })
        : style,
    children:
      typeof children === 'function' ? (
        (state) => (
          <>
            {fade}
            {children(state)}
          </>
        )
      ) : (
        <>
          {fade}
          {children}
        </>
      ),
  };
}

const styles = StyleSheet.create({
  fade: { pointerEvents: 'none' },
});
