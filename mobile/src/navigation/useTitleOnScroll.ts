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
import { useNamedBackTitle } from './useNamedBackOptions';
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

// SF Pro 17 pt advances tuned to lane lead's device measurements, 10 Nov 2026.
const backTitleAdvances = [
  [" ijl.,':;I", 5],
  ['frt', 6.5],
  ['mw', 14],
  ['MW', 15.5],
  ['0123456789', 10],
  ['B', 12.5],
  ['L', 13.5],
  ['s', 8.5],
] as const;

/** Chevron and padding plus text advances, rounded up to whole points. */
export function backPillWidth(title: string): number {
  let width = 48;
  for (const character of title) {
    width +=
      backTitleAdvances.find(([glyphs]) => glyphs.includes(character))?.[1] ??
      (/[A-Z]/.test(character) ? 11.5 : 9.5);
  }
  return Math.ceil(width);
}

/**
 * The widest a bar title may be between the bar's items: iOS 26
 * draws each item as a 44 pt glass circle 16 pt from the edge, and a group
 * adds 60 pt an item. A React title view is laid out by Yoga, not UIKit, so
 * nothing else stops its text running under the items (bills-07). On wide
 * windows (iPad) the stack can be narrower than the window, so it keeps to
 * half the window. A known back name reserves its own pill width, allowing
 * UIKit to place the title off-centre between unequal groups.
 */
export function barTitleWidth(
  windowWidth: number,
  trailing = 2,
  trailingWidth?: number,
  backTitle?: string,
): number {
  if (backTitle) {
    const leadingReserve = 16 + backPillWidth(backTitle) + 20;
    const trailingReserve =
      16 + (trailingWidth ?? 44 + 60 * Math.max(0, trailing - 1)) + 20;
    const room = Math.max(0, windowWidth - leadingReserve - trailingReserve);
    return windowWidth >= 600 ? Math.min(room, windowWidth / 2) : room;
  }
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
 * On iOS 26, react-native-screens sizes the centre title subview from its
 * first layout. Starting with zero width and empty text prevents later
 * titles from drawing, even when scroll measurement and setOptions work.
 * Keep the known title laid out within the named back and trailing items,
 * and hide it with opacity alone. Lane-lead simulator probes confirmed it.
 */
export function BarTitle({
  title,
  shown,
  trailing = 2,
  trailingWidth,
  backTitle,
}: {
  title: string;
  shown: boolean;
  /** How many items the bar draws after the title: ⋯ alone is 1. */
  trailing?: number;
  /** Combined item widths for a bar with a text pill, excluding margins. */
  trailingWidth?: number;
  /** Resolved native back name, used to keep its pill clear of the title. */
  backTitle?: string;
}) {
  const reduceMotion = useReduceMotionSetting();
  const { width } = useWindowDimensions();
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
      testID: 'bar-title',
      style: [
        style,
        {
          color: colors.ink,
          opacity,
          maxWidth: barTitleWidth(width, trailing, trailingWidth, backTitle),
        },
      ],
    },
    title,
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
  const namedBackTitle = useNamedBackTitle();
  const backTitle = Platform.OS === 'ios' ? namedBackTitle : undefined;
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
                  backTitle,
                }),
            },
      );
    },
    [title, setOptions, trailing, trailingWidth, backTitle],
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
                backTitle,
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
    backTitle,
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
