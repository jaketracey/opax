import { useCallback, useContext, useRef, type RefObject } from 'react';
import {
  Keyboard,
  useWindowDimensions,
  type ScrollView,
  type View,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { rhythm } from './tokens';

/**
 * Brings a view that appears under a form, such as its error, into sight
 * inside a Screen, clear of the home indicator. Give `scrollRef` and
 * `onScroll` to the Screen and call `reveal(view)` once the view is drawn;
 * the returned function cancels a pending reveal.
 *
 * The caller hides the keyboard first. While it is still going down, the
 * reveal waits for it, so the page is measured as it will rest: measured
 * earlier, a reveal clears a keyboard that is leaving and over-scrolls.
 * It only ever scrolls down, and only as far as the view needs.
 */
export function useScrollReveal() {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const { height } = useWindowDimensions();
  const bottom = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const onScroll = useCallback((y: number) => {
    offset.current = y;
  }, []);
  const reveal = useCallback(
    (target: RefObject<View | null>) => {
      let frame: number | undefined;
      const measure = () => {
        frame = requestAnimationFrame(() =>
          target.current?.measureInWindow((_x, y, _width, viewHeight) => {
            const by = y + viewHeight - (height - bottom - rhythm.block);
            if (by > 0)
              scrollRef.current?.scrollTo({
                y: offset.current + by,
                animated: true,
              });
          }),
        );
      };
      const hidden = Keyboard.isVisible()
        ? Keyboard.addListener('keyboardDidHide', () => {
            hidden?.remove();
            measure();
          })
        : null;
      if (!hidden) measure();
      return () => {
        hidden?.remove();
        if (frame !== undefined) cancelAnimationFrame(frame);
      };
    },
    [height, bottom],
  );
  return { scrollRef, onScroll, reveal };
}
