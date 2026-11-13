import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  Dimensions,
  Keyboard,
  Platform,
  useWindowDimensions,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';
import {
  KeyboardProvider,
  useKeyboardHandler,
} from 'react-native-keyboard-controller';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../design/accessibility';

/**
 * The top of a keyboard docked at the screen's bottom edge, in screen points.
 * Null when there is none to make room for: an empty frame (UIKit reports one
 * for a floating or cross-faded keyboard) or iPad's floating keyboard, which
 * stands clear of the bottom edge. A hardware keyboard's shortcuts bar is
 * docked, so it counts.
 */
export function dockedKeyboardTop(
  end: Partial<KeyboardEvent['endCoordinates']> | undefined,
  screenHeight: number,
): number | null {
  if (!end || typeof end.screenY !== 'number') return null;
  const { screenY, width, height } = end;
  if (width === 0 && height === 0) return null;
  if (typeof height === 'number' && screenY + height < screenHeight - 1)
    return null;
  return screenY;
}

/**
 * True when an iOS keyboard frame leaves the bottom edge clear: iPad's
 * floating keyboard, or the empty frame UIKit reports as it undocks. The
 * settled overlap and KeyboardLift read the same frames the same way.
 */
function keyboardFloats(event: KeyboardEvent) {
  return (
    dockedKeyboardTop(event.endCoordinates, Dimensions.get('screen').height) ===
    null
  );
}

/**
 * How far the keyboard overlaps the bottom of `ref` once it has arrived, for
 * layout that settles once (the conversation's bottom room, the composer's
 * height cap, the band behind the composer). The composer itself follows the
 * keyboard frame by frame through KeyboardLift.
 */
export function useKeyboardOverlap(
  ref: RefObject<View | null>,
  layoutKey = '',
) {
  const [overlap, setOverlap] = useState(0);
  const [visible, setVisible] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  // Android resizes the native window with the IME. Measure the remaining
  // overlap after that resize, so its height is never subtracted twice.
  // Edge-to-edge can keep the window dimensions unchanged while hiding the
  // tab bar grows this view after keyboardDidShow. Remeasure its layout too.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let active = true;
    const measure = (top: number) => {
      ref.current?.measureInWindow((_x, y, _w, height) => {
        if (!active || !Keyboard.isVisible()) return;
        setVisible(Keyboard.isVisible());
        setOverlap(Math.max(0, Math.round(y + height - top)));
      });
    };
    const metrics = Keyboard.metrics();
    if (metrics) measure(metrics.screenY);
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setVisible(true);
      measure(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setVisible(false);
      setOverlap(0);
    });
    return () => {
      active = false;
      show.remove();
      hide.remove();
    };
  }, [ref, windowHeight, layoutKey]);
  // iOS says where the keyboard is going before it moves.
  useEffect(() => {
    if (Platform.OS === 'android') return;
    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      if (keyboardFloats(event)) {
        setOverlap(0);
        return;
      }
      const top = event.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, height) =>
        setOverlap(Math.max(0, Math.round(y + height - top))),
      );
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setOverlap(0));
    return () => {
      change.remove();
      hide.remove();
    };
  }, [ref]);
  return {
    overlap,
    visible: Platform.OS === 'android' ? visible : overlap > 0,
  };
}

/** A band the composer must not cover: a horizontal fold or a camera. */
export interface Obstacle {
  top: number;
  bottom: number;
}

/**
 * The composer's vertical offset from its resting place (0 or less) for a
 * keyboard `keyboard` points tall from the window's bottom edge, when the
 * resting area's bottom edge stands `gap` points above that edge. It rises by
 * however far the keyboard covers the area and, if that would put it across
 * a fold or camera above, it moves above that as well (`obstacles`, in the
 * area's own points, lowest first).
 */
export function composerLift(
  keyboard: number,
  gap: number,
  rest: { top: number; height: number },
  obstacles: readonly Obstacle[],
): number {
  'worklet';
  let top = rest.top - Math.max(0, keyboard - gap);
  for (const obstacle of obstacles)
    if (top < obstacle.bottom && top + rest.height > obstacle.top)
      top = obstacle.top - rest.height;
  return Math.min(0, top - rest.top);
}

/**
 * Keyboard frames for KeyboardLift, from react-native-keyboard-controller
 * (mounted once, at the root). iOS only, and it does not preload the
 * keyboard. Reanimated's own useAnimatedKeyboard reports nothing until the
 * keyboard has arrived on iOS 26 and later (deprecated in Reanimated 4 for
 * that), so the bar moved after the keyboard instead of with it. Android
 * keeps the IME's own window resize.
 */
export function KeyboardFrames({ children }: { children: ReactNode }) {
  return Platform.OS === 'ios' ? (
    <KeyboardProvider preload={false}>{children}</KeyboardProvider>
  ) : (
    children
  );
}

/**
 * The composer at its resting place, lifted by the iOS keyboard frame by
 * frame on the UI thread, so the bar rises and falls with the keyboard and
 * follows an interactive dismissal under the finger. Layout stays at rest,
 * so nothing waits for React to commit. With Reduce Motion it takes the
 * keyboard's end position at once. iPad's floating keyboard lifts nothing.
 * iOS only (KeyboardFrames).
 */
export function KeyboardLift({
  area,
  layoutKey,
  rest,
  obstacles,
  style,
  onLayout,
  testID,
  children,
}: {
  /** The resting area the composer sits at the bottom of. */
  area: RefObject<View | null>;
  /** Changes when the area's size changes, so its window position is read again. */
  layoutKey: string;
  rest: { top: number; height: number };
  obstacles: readonly Obstacle[];
  style: StyleProp<ViewStyle>;
  onLayout: (event: LayoutChangeEvent) => void;
  testID: string;
  children: ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  const { height: windowHeight } = useWindowDimensions();
  // The keyboard's height over the window's bottom edge, frame by frame.
  const keyboard = useSharedValue(0);
  // The window's bottom edge to the area's bottom edge (the tab bar, the
  // home indicator).
  const gap = useSharedValue(0);
  // iPad's floating keyboard covers nothing at the bottom edge, but
  // keyboard-controller reports its height all the same. The last frame
  // UIKit announced says which it is, as it does for the settled overlap. A
  // docked keyboard is the default, so its rise never waits for JS.
  const floating = useSharedValue(false);
  useKeyboardHandler(
    {
      // Where the keyboard is going: Reduce Motion goes there at once.
      onStart: (event) => {
        'worklet';
        if (reduceMotion) keyboard.value = floating.value ? 0 : event.height;
      },
      onMove: (event) => {
        'worklet';
        if (!reduceMotion) keyboard.value = floating.value ? 0 : event.height;
      },
      // The reader drags it (an interactive dismissal): follow the finger.
      onInteractive: (event) => {
        'worklet';
        keyboard.value = floating.value ? 0 : event.height;
      },
      onEnd: (event) => {
        'worklet';
        keyboard.value = floating.value ? 0 : event.height;
      },
    },
    [reduceMotion],
  );
  useEffect(() => {
    const change = Keyboard.addListener('keyboardWillChangeFrame', (event) => {
      const floats = keyboardFloats(event);
      floating.value = floats;
      if (floats) keyboard.value = 0;
    });
    return () => change.remove();
  }, [floating, keyboard]);
  useEffect(() => {
    const measure = () =>
      area.current?.measureInWindow((_x, y, _w, height) => {
        gap.value = Math.max(0, windowHeight - (y + height));
      });
    measure();
    // Read again as a keyboard comes, in case the screen moved without
    // resizing the area.
    const show = Keyboard.addListener('keyboardWillShow', measure);
    return () => show.remove();
  }, [area, layoutKey, windowHeight, gap]);
  const lift = useAnimatedStyle(
    () => ({
      transform: [
        {
          translateY: composerLift(keyboard.value, gap.value, rest, obstacles),
        },
      ],
    }),
    [rest, obstacles],
  );
  return (
    <Reanimated.View testID={testID} onLayout={onLayout} style={[style, lift]}>
      {children}
    </Reanimated.View>
  );
}
