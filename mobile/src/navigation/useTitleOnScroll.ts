import {
  createContext,
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Animated,
  Platform,
  View as NativeView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type Text,
  type View,
} from 'react-native';
import { useSafeSetOptions } from './preview';
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

/**
 * The widest a bar title may be, centred between the bar's items: iOS 26
 * draws each item as a 44 pt glass circle 16 pt from the edge, and a group
 * adds 60 pt an item. A React title view is laid out by Yoga, not UIKit, so
 * nothing else stops its text running under the items (bills-07). On wide
 * windows (iPad) the stack can be narrower than the window, so it keeps to
 * half the window.
 */
export function barTitleWidth(
  windowWidth: number,
  trailing = 2,
  trailingWidth?: number,
): number {
  if (trailingWidth !== undefined) {
    // A text pill needs its actual width, not the circle estimate below.
    // Reserve a short named back button (100 pt), the two 16 pt margins
    // and an 8 pt gap on either side of the title. UIKit can place this
    // title off-centre between the unequal leading and trailing groups.
    const room = Math.max(0, windowWidth - 100 - trailingWidth - 2 * (16 + 8));
    return windowWidth >= 600 ? Math.min(room, windowWidth / 2) : room;
  }
  const side = 16 + 44 + 60 * Math.max(0, trailing - 1) + 8;
  const room = Math.max(0, windowWidth - 2 * side);
  return windowWidth >= 600 ? Math.min(room, windowWidth / 2) : room;
}

/**
 * The bar's title view. At rest it has no width, so UIKit keeps the room for
 * a named back button (a hidden but full-width title made it a bare chevron,
 * wave 4 bills-06, money-03); shown, it truncates inside the bar items.
 */
export function BarTitle({
  title,
  shown,
  trailing = 2,
  trailingWidth,
}: {
  title: string;
  shown: boolean;
  /** How many items the bar draws after the title: ⋯ alone is 1. */
  trailing?: number;
  /** Combined item widths for a bar with a text pill, excluding margins. */
  trailingWidth?: number;
}) {
  const reduceMotion = useReduceMotionSetting();
  const { width } = useWindowDimensions();
  const [opacity] = useState(() => new Animated.Value(shown ? 1 : 0));
  const [present, setPresent] = useState(shown);
  if (shown && !present) setPresent(true);
  useEffect(() => {
    const fade = Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: reduceMotion === false ? motion.duration.crossfade : 0,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished && !shown) setPresent(false);
    });
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
      testID: 'bar-title',
      style: [
        style,
        {
          color: colors.ink,
          opacity,
          maxWidth: present ? barTitleWidth(width, trailing, trailingWidth) : 0,
        },
      ],
    },
    present ? title : '',
  );
}

/**
 * A route's bar before its subject's title is known: an empty title view.
 * `headerTitle: ''` would also blank the route's `title`, which UIKit reads
 * for the next screen's back button (records-01, bills-15), and leaving it
 * unset draws the route title as a string at once.
 */
export function emptyBarTitle() {
  return createElement(NativeView, {
    style: { width: 0, height: 0 },
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
  });
}

type TitleRef = RefObject<View | Text | null>;
/**
 * Use the H1's ref outside Screen. Wire onTitleLayout and onScroll to the
 * title wrapper and scrolling view. iOS compares the ref's measured window
 * bottom with the native header. Screen can instead report its content
 * anchor with setAnchorBottom and provide it through TitleAnchorContext.
 */
export function useTitleOnScroll(
  ref: TitleRef | null,
  title?: string,
  {
    trailing = 2,
    trailingWidth,
  }: { trailing?: number; trailingWidth?: number } = {},
) {
  const setOptions = useSafeSetOptions();
  const headerHeight = useHeaderBottom();
  const [anchor, setAnchor] = useState<number | null>(null);
  const shown = useRef(false);
  const offset = useRef(0);
  const hasScrolled = useRef(false);
  const measurementRequest = useRef(0);
  const windowRef = Platform.OS === 'ios' && ref !== null;
  const installed = useRef(false);
  const setAnchorBottom = useCallback(
    (bottom: number) =>
      setAnchor((current) => (current === bottom ? current : bottom)),
    [],
  );
  const invalidateMeasurements = useCallback(() => {
    measurementRequest.current++;
  }, []);
  const updateShown = useCallback(
    (next: boolean) => {
      if (!title || next === shown.current) return;
      shown.current = next;
      setOptions(
        Platform.OS === 'android'
          ? { headerTitle: next ? title : '' }
          : {
              headerTitle: () =>
                createElement(BarTitle, {
                  title,
                  shown: next,
                  trailing,
                  trailingWidth,
                }),
            },
      );
    },
    [title, setOptions, trailing, trailingWidth],
  );
  const measureHeading = useCallback(() => {
    const request = ++measurementRequest.current;
    const node = ref?.current;
    // A virtualised heading can unmount above the viewport. Keep its
    // revealed title, and invalidate any response from the previous node.
    if (!node) return;
    node.measure((x, y, width, height, pageX, pageY) => {
      if (request !== measurementRequest.current || ref?.current !== node)
        return;
      if (
        ![x, y, width, height, pageX, pageY].every(Number.isFinite) ||
        height <= 0
      )
        return;
      // Fabric's window measurement and the JS scroll stream can describe
      // different frames. Compare only window coordinates, with 1 pt slack.
      updateShown(pageY + height <= headerHeight + 1);
    });
  }, [ref, headerHeight, updateShown]);
  useLayoutEffect(() => {
    if (!title) return;
    if (!windowRef)
      shown.current = anchor !== null && offset.current + headerHeight > anchor;
    const visible = shown.current;
    setOptions({
      title,
      ...(Platform.OS === 'android'
        ? { headerTitle: shown.current ? title : '' }
        : {
            headerTitle: () =>
              createElement(BarTitle, {
                title,
                shown: visible,
                trailing,
                trailingWidth,
              }),
          }),
    });
    installed.current = anchor !== null;
    if (windowRef && hasScrolled.current) measureHeading();
    // A response queued before a header/route change or unmount is stale.
    return invalidateMeasurements;
  }, [
    title,
    anchor,
    setOptions,
    headerHeight,
    trailing,
    trailingWidth,
    windowRef,
    measureHeading,
    invalidateMeasurements,
  ]);
  const onScroll = useCallback(
    (event: number | NativeSyntheticEvent<NativeScrollEvent>) => {
      if (windowRef) {
        hasScrolled.current = true;
        measureHeading();
        return;
      }
      offset.current =
        typeof event === 'number' ? event : event.nativeEvent.contentOffset.y;
      if (!installed.current || anchor === null || !title) return;
      updateShown(offset.current + headerHeight > anchor);
    },
    [anchor, title, headerHeight, measureHeading, windowRef, updateShown],
  );
  // Hand over only after the heading's bottom has passed under the bar.
  const onTitleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (windowRef) {
        // No pre-layout measurement at rest, and no hidden flash on relayout.
        if (hasScrolled.current) measureHeading();
      } else if (ref?.current) {
        // Preserve the Android content-coordinate path from the baseline.
        ref.current.measure((_x, _y, _width, height, _pageX, pageY) =>
          setAnchorBottom(pageY + offset.current + height),
        );
      } else {
        const { y, height } = event.nativeEvent.layout;
        setAnchorBottom(y + height);
      }
    },
    [ref, setAnchorBottom, measureHeading, windowRef],
  );
  return { onScroll, onTitleLayout, setAnchorBottom };
}
