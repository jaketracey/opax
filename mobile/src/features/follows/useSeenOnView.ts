import { useContext, useEffect, useRef, type RefObject } from 'react';
import { AppState, useWindowDimensions } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useHeaderBottom } from '../../design/useHeaderBottom';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

export interface SeenView {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}
/** Poll native geometry so scrolling a parent needs no screen-specific event. */
export function useSeenOnView(
  ref: RefObject<SeenView | null>,
  keys: readonly string[],
  onSeen: (keys: readonly string[]) => void,
): void {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const navigation = useContext(NavigationContext);
  const top = useHeaderBottom();
  const callback = useRef(onSeen);
  const shownKeys = useRef(keys);
  useEffect(() => {
    callback.current = onSeen;
    shownKeys.current = keys;
  });
  useEffect(() => {
    let active = true;
    let focused = navigation?.isFocused() ?? true;
    let foreground =
      AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive';
    let everVisible = false;
    let visibleSince: number | null = null;
    let marked = false;
    let visibleKeys: readonly string[] = [];
    const mark = () => {
      if (!marked && everVisible) {
        marked = true;
        callback.current(visibleKeys);
      }
    };
    const measure = () => {
      if (!active || marked || !focused || !foreground) return;
      ref.current?.measureInWindow((_x, y, width, height) => {
        if (!active || !focused || !foreground || marked) return;
        const visible =
          width > 0 &&
          height > 0 &&
          y >= top &&
          y < windowHeight - (insets?.bottom ?? 0);
        if (!visible) {
          visibleSince = null;
          return;
        }
        everVisible = true;
        visibleKeys = shownKeys.current;
        visibleSince ??= Date.now();
        if (Date.now() - visibleSince >= 1000) mark();
      });
    };
    const timer = setInterval(measure, 100);
    // Measuring at mount starts the clock, it never marks a mount as seen.
    measure();
    const app = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (!foreground) {
        mark();
        visibleSince = null;
      } else measure();
    });
    const blur = navigation?.addListener('blur', () => {
      focused = false;
      mark();
      visibleSince = null;
    });
    const focus = navigation?.addListener('focus', () => {
      focused = true;
      measure();
    });
    return () => {
      active = false;
      clearInterval(timer);
      app.remove();
      blur?.();
      focus?.();
      mark();
    };
  }, [ref, windowHeight, top, insets?.bottom, navigation]);
}
