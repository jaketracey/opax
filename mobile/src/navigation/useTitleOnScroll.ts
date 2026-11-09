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
export function barTitleWidth(windowWidth: number, trailing = 2): number {
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
}: {
  title: string;
  shown: boolean;
  /** How many items the bar draws after the title: ⋯ alone is 1. */
  trailing?: number;
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
          maxWidth: present ? barTitleWidth(width, trailing) : 0,
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
 * title wrapper and scrolling view. Screen can instead report its content
 * anchor with setAnchorBottom and provide it through TitleAnchorContext.
 */
export function useTitleOnScroll(
  ref: TitleRef | null,
  title?: string,
  { trailing = 2 }: { trailing?: number } = {},
) {
  const setOptions = useSafeSetOptions();
  const headerHeight = useHeaderBottom();
  const [anchor, setAnchor] = useState<number | null>(null);
  const shown = useRef(false);
  const offset = useRef<number | null>(null);
  const needsMeasurement = useRef(false);
  const measuring = useRef(false);
  const layoutVersion = useRef(0);
  const installed = useRef(false);
  const setAnchorBottom = useCallback(
    (bottom: number) =>
      setAnchor((current) => (current === bottom ? current : bottom)),
    [],
  );
  const measureHeading = useCallback(() => {
    const node = ref?.current;
    const measuredOffset = offset.current;
    if (!node || measuredOffset === null || measuring.current) return;
    const version = layoutVersion.current;
    measuring.current = true;
    node.measure((_x, _y, width, height, _pageX, pageY) => {
      measuring.current = false;
      // A flattened or not-yet-mounted native view can measure as zero.
      // Never substitute the wrapper's parent-relative onLayout y here.
      // Nor combine an asynchronous measurement with a newer scroll offset.
      if (
        ref.current !== node ||
        version !== layoutVersion.current ||
        measuredOffset !== offset.current ||
        !Number.isFinite(pageY) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        !(width > 0 && height > 0)
      )
        return;
      needsMeasurement.current = false;
      setAnchorBottom(pageY + measuredOffset + height);
    });
  }, [ref, setAnchorBottom]);
  useLayoutEffect(() => {
    if (!title) return;
    shown.current =
      anchor !== null && (offset.current ?? 0) + headerHeight > anchor;
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
              }),
          }),
    });
    installed.current = anchor !== null;
  }, [title, anchor, setOptions, headerHeight, trailing]);
  const onScroll = useCallback(
    (event: number | NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current =
        typeof event === 'number' ? event : event.nativeEvent.contentOffset.y;
      if (needsMeasurement.current) measureHeading();
      if (!installed.current || anchor === null || !title) return;
      const next = offset.current + headerHeight > anchor;
      if (next === shown.current) return;
      shown.current = next;
      setOptions(
        Platform.OS === 'android'
          ? { headerTitle: next ? title : '' }
          : {
              headerTitle: () =>
                createElement(BarTitle, { title, shown: next, trailing }),
            },
      );
    },
    [anchor, title, setOptions, headerHeight, trailing, measureHeading],
  );
  // Hand over only after the heading's bottom has passed under the bar.
  const onTitleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (ref) {
        layoutVersion.current++;
        needsMeasurement.current = true;
        setAnchor(null);
        // iOS's initial automatic inset gives a negative resting offset.
        // Until its first scroll event, pageY cannot be converted back to
        // content coordinates. Keep the bar hidden rather than assume zero.
        measureHeading();
      } else {
        const { y, height } = event.nativeEvent.layout;
        if (height > 0) setAnchorBottom(y + height);
      }
    },
    [ref, setAnchorBottom, measureHeading],
  );
  return { onScroll, onTitleLayout, setAnchorBottom };
}
