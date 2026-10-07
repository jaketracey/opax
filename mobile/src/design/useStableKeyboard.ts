import { useContext, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  useWindowDimensions,
  type ScrollView,
  type View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { spacing } from './tokens';

/**
 * Own keyboard space and the opening reveal of the action. UIKit owns the
 * navigation/tab-bar insets and large-title collapse. Dismissal never rewinds
 * the scroll offset.
 * Retain the space needed by the current editing offset when results replace
 * suggestions or the keyboard closes, so short content cannot clamp it.
 */
export function useStableKeyboard(
  scroll: RefObject<ScrollView | null>,
  target?: RefObject<View | null>,
) {
  const { height: windowHeight } = useWindowDimensions();
  const bottomInset = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [viewportHeight, setViewportHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [offsetFloor, setOffsetFloor] = useState<number | null>(null);
  const offset = useRef(0);
  const keyboard = useRef(0);
  useEffect(() => {
    let frame: number | undefined;
    // Reveal the action only on opening/resizing the keyboard. Never rewind
    // the offset on dismissal. Measure after the content spacer is committed.
    const reveal = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (keyboard.current <= 0) return;
          target?.current?.measureInWindow((_x, y, _width, height) => {
            if (keyboard.current <= 0) return;
            const obscured =
              y +
              height -
              (windowHeight -
                (Platform.OS === 'android' ? 0 : keyboard.current) -
                spacing.s4);
            if (obscured > 0)
              scroll.current?.scrollTo({
                y: offset.current + obscured,
                animated: true,
              });
          });
        });
      });
    };
    const subscription = Keyboard.addListener(
      'keyboardWillChangeFrame',
      (e) => {
        const height = Math.max(0, windowHeight - e.endCoordinates.screenY);
        if (height > 0 && keyboard.current === 0)
          setOffsetFloor(offset.current);
        keyboard.current = height;
        setKeyboardHeight(height);
        if (height > 0) reveal();
      },
    );
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      if (Platform.OS === 'android') {
        keyboard.current = event.endCoordinates.height;
        setOffsetFloor(offset.current);
      }
      reveal();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      if (Platform.OS === 'android') keyboard.current = 0;
    });
    return () => {
      subscription.remove();
      shown.remove();
      hidden.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [windowHeight, scroll, target]);
  return {
    onLayout(e: LayoutChangeEvent) {
      setViewportHeight(e.nativeEvent.layout.height);
    },
    onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
      const y = e.nativeEvent.contentOffset.y;
      offset.current = y;
      if (keyboard.current > 0)
        setOffsetFloor((floor) => Math.max(floor ?? y, y));
      // Release retained space as the reader scrolls back toward the top.
      // Negative offsets are valid within UIKit's adjusted navigation inset.
      else
        setOffsetFloor((floor) => (floor === null ? null : Math.min(floor, y)));
    },
    contentStyle: {
      // No artificial height at rest. Retain only the height needed for the
      // current offset, excluding the native tab-bar safe area at the bottom.
      minHeight:
        offsetFloor === null
          ? 0
          : Math.max(0, viewportHeight - bottomInset + offsetFloor),
      paddingBottom: spacing.s7 + keyboardHeight,
    },
  };
}
