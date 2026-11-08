import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Animated,
  Platform,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type Text,
  type View,
} from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { useReduceMotionSetting } from '../design/accessibility';
import { colors, motion, textStyles } from '../design/tokens';

/** H1 bottom edge in the scroll content's coordinates. Screen provides this. */
export const TitleAnchorContext = createContext<
  ((bottom: number) => void) | null
>(null);

// Mirrors the existing inline navigation ramp (17 pt to 23 pt). The device
// reviewer must confirm this cap at AX5; this lane never boots a simulator.
export const inlineTitleScaleCap = 23 / 17;

export function BarTitle({ title, shown }: { title: string; shown: boolean }) {
  const reduceMotion = useReduceMotionSetting();
  const [opacity] = useState(() => new Animated.Value(shown ? 1 : 0));
  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: reduceMotion === false ? motion.duration.crossfade : 0,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [shown, reduceMotion, opacity]);
  const {
    dynamicTypeRamp: _ramp,
    tabular: _tabular,
    ...style
  } = textStyles.inlineTitle;
  return createElement(
    Animated.Text,
    {
      numberOfLines: 1,
      ellipsizeMode: 'tail',
      maxFontSizeMultiplier: inlineTitleScaleCap,
      accessibilityElementsHidden: !shown,
      importantForAccessibility: shown ? 'auto' : 'no-hide-descendants',
      style: [style, { color: colors.ink, opacity }],
    },
    title,
  );
}

type TitleRef = RefObject<View | Text | null>;
/**
 * Use the H1's ref outside Screen. Wire onTitleLayout and onScroll to the
 * title wrapper and scrolling view. Screen can instead report its content
 * anchor with setAnchorBottom and provide it through TitleAnchorContext.
 */
export function useTitleOnScroll(ref: TitleRef | null, title?: string) {
  const navigation = useContext(NavigationContext);
  const headerHeight = useHeaderBottom();
  const [anchor, setAnchor] = useState<number | null>(null);
  const shown = useRef(false);
  const offset = useRef(0);
  const installed = useRef(false);
  const setAnchorBottom = useCallback(
    (bottom: number) =>
      setAnchor((current) => (current === bottom ? current : bottom)),
    [],
  );
  useEffect(() => {
    if (!title || anchor === null || !navigation) return;
    shown.current = offset.current + headerHeight > anchor;
    navigation.setOptions({
      title,
      ...(Platform.OS === 'android'
        ? { headerTitle: shown.current ? title : '' }
        : {
            headerTitle: () =>
              createElement(BarTitle, { title, shown: shown.current }),
          }),
    });
    installed.current = true;
  }, [title, anchor, navigation, headerHeight]);
  const onScroll = useCallback(
    (event: number | NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current =
        typeof event === 'number' ? event : event.nativeEvent.contentOffset.y;
      if (!installed.current || anchor === null || !title || !navigation)
        return;
      const next = offset.current + headerHeight > anchor;
      if (next === shown.current) return;
      shown.current = next;
      navigation.setOptions(
        Platform.OS === 'android'
          ? { headerTitle: next ? title : '' }
          : {
              headerTitle: () =>
                createElement(BarTitle, { title, shown: next }),
            },
      );
    },
    [anchor, title, navigation, headerHeight],
  );
  const onTitleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (ref?.current) {
        ref.current.measure((_x, _y, _width, height, _pageX, pageY) =>
          setAnchorBottom(pageY + offset.current + height),
        );
      } else {
        const { y, height } = event.nativeEvent.layout;
        setAnchorBottom(y + height);
      }
    },
    [ref, setAnchorBottom],
  );
  return { onScroll, onTitleLayout, setAnchorBottom };
}
