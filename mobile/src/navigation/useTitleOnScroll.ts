import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  Text as NativeText,
  View as NativeView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type Text,
  type View,
} from 'react-native';
import { NavigationRouteContext } from 'expo-router/react-navigation';
import { useSafeSetOptions } from './preview';
import { useNamedBackTitle } from './useNamedBackOptions';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { useReduceMotionSetting } from '../design/accessibility';
import {
  colors,
  isAccessibilityCategory,
  motion,
  textStyles,
} from '../design/tokens';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../modules/opax-root-bar';
import { useAdaptiveDevice } from '../design/adaptive';

/** H1 bottom edge in the scroll content's coordinates. Screen provides this. */
export const TitleAnchorContext = createContext<
  ((bottom: number) => void) | null
>(null);

// Mirrors the existing inline navigation ramp (17 pt to 23 pt). The device
// reviewer must confirm this cap at AX5; this lane never boots a simulator.
export const inlineTitleScaleCap = 23 / 17;
/**
 * At accessibility sizes UIKit draws each bar item's symbol larger: the
 * share and More pair measured 114 pt at AX3 against 103 pt at Large
 * (sweep 1, light-ax3/s1-person-02). Each trailing item reserves this
 * much more.
 */
export const barItemGrowthAX = 6;
/**
 * UIKit sets a title view that fits 12.7 pt after the back button and at
 * least 9.3 pt before the trailing items (measured at AX3). One wider than
 * that span is pinned to the trailing side and runs left over the back
 * button: 5 pt clear at AX3 with a 205 pt view. At AX sizes the title
 * gives up this much more room, so the view fits the span and keeps 8 pt
 * or more on each side.
 */
export const barTitleClearanceAX = 8;
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
  measuredBackWidth?: number,
  /** Extra width per trailing symbol item: `barItemGrowthAX` at AX sizes. */
  itemGrowth = 0,
): number {
  const items =
    trailingWidth ??
    44 + 60 * Math.max(0, trailing - 1) + itemGrowth * Math.max(0, trailing);
  if (backTitle === '') {
    const room = Math.max(0, windowWidth - (16 + 44 + 8) - (16 + items + 8));
    return windowWidth >= 600 ? Math.min(room, windowWidth / 2) : room;
  }
  if (backTitle) {
    const leadingReserve = 16 + 48 + (measuredBackWidth ?? 0) + 20;
    const trailingReserve = 16 + items + 20;
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
  const side =
    16 + 44 + 60 * Math.max(0, trailing - 1) + itemGrowth * trailing + 8;
  const room = Math.max(0, windowWidth - 2 * side);
  return windowWidth >= 600 ? Math.min(room, windowWidth / 2) : room;
}

/** Useful alternatives, measured by native Text in the bar's own font. */
export function barTitleCandidates(title: string, person = false): string[] {
  const words = title.trim().split(/\s+/);
  if (person) return [...new Set([title, words.at(-1)!])];
  return [
    title,
    ...Array.from(
      { length: Math.max(0, words.length - 2) },
      (_, index) => `${words.slice(0, words.length - 1 - index).join(' ')}…`,
    ),
  ];
}

/** Full subject first, then the back name, then a useful whole-word cut. */
export function retreatBarTitle(
  title: string,
  namedRoom: number,
  minimalRoom: number,
  measure: (text: string) => number | undefined,
  person = false,
): { text: string | null; mode: 'default' | 'minimal'; room: number } {
  const fits = (text: string, room: number) => {
    const width = measure(text);
    return width !== undefined && width <= room;
  };
  if (fits(title, namedRoom))
    return { text: title, mode: 'default', room: namedRoom };
  if (fits(title, minimalRoom))
    return { text: title, mode: 'minimal', room: minimalRoom };
  const text =
    barTitleCandidates(title, person)
      .slice(1)
      .find((candidate) => fits(candidate, minimalRoom)) ?? null;
  return { text, mode: 'minimal', room: minimalRoom };
}

/**
 * Keep the subject laid out from the first frame for react-native-screens.
 * Hidden horizontal probes give native font advances without truncation,
 * including Dynamic Type and Bold Text. A measurement belongs to its title
 * and type size, so a resize or a new subject cannot reuse stale advances.
 */
export function BarTitle({
  title,
  shown,
  trailing = 2,
  trailingWidth,
  backTitle,
  person = false,
}: {
  title: string;
  shown: boolean;
  trailing?: number;
  trailingWidth?: number;
  backTitle?: string;
  person?: boolean;
}) {
  const reduceMotion = useReduceMotionSetting();
  const setOptions = useSafeSetOptions();
  const { width, fontScale } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const adaptive = useAdaptiveDevice();
  const safeWidth =
    adaptive || insets?.left !== insets?.right
      ? width - (insets?.left ?? 0) - (insets?.right ?? 0)
      : width;
  // At AX sizes the bar's own text keeps its Large size while this title
  // follows the inline ramp to 23 pt. Choose the retreat at the Large size,
  // as every other size does, and let the drawn title shrink back towards
  // it to fit: a title that fits at Large is shown at AX3 (sweep 1, 2.6).
  const ax = isAccessibilityCategory(fontScale);
  const growth = ax ? barItemGrowthAX : 0;
  const clearance = ax ? barTitleClearanceAX : 0;
  const key = `${title}:${backTitle}:${fontScale}`;
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const measured = (text: string) => metrics[`${key}:${text}`];
  const candidates = barTitleCandidates(title, person);
  const backWidth = metrics[`${key}:back`];
  const ready =
    candidates.every((text) => measured(text) !== undefined) &&
    (!backTitle || backWidth !== undefined);
  const namedRoom = Math.max(
    0,
    barTitleWidth(
      safeWidth,
      trailing,
      trailingWidth,
      backTitle,
      backWidth,
      growth,
    ) - clearance,
  );
  const [measurement, setMeasurement] = useState({
    key,
    shown,
    expired: false,
    room: namedRoom,
  });
  // Invalidate an earlier wait before rendering a new title or reveal.
  if (measurement.key !== key || measurement.shown !== shown)
    setMeasurement({
      key,
      shown,
      // Keep the outgoing title available throughout its existing fade.
      expired: measurement.key === key && !shown && measurement.expired,
      room:
        measurement.key === key && !shown && measurement.expired
          ? measurement.room
          : namedRoom,
    });
  useEffect(() => {
    if (!measurement.shown || ready || measurement.expired) return;
    // Native text layout can fail to report. Keep the previous full,
    // tail-truncated title available once the heading has left the content.
    const timeout = setTimeout(
      () =>
        setMeasurement((current) =>
          current === measurement ? { ...current, expired: true } : current,
        ),
      300,
    );
    return () => clearTimeout(timeout);
  }, [measurement, ready]);
  // Once visible, keep the full fallback and its room for this reveal.
  // Late native measurements take effect after the heading returns.
  const fallback = measurement.expired;
  const minimalRoom = Math.max(
    0,
    barTitleWidth(safeWidth, trailing, trailingWidth, '', undefined, growth) -
      clearance,
  );
  const retreat = retreatBarTitle(
    title,
    namedRoom,
    minimalRoom,
    measured,
    person,
  );
  const fits = fallback || (ready && retreat.text !== null);
  const visible = shown && fits;
  const backMode = fallback ? 'default' : retreat.mode;
  const [opacity] = useState(() => new Animated.Value(0));
  useLayoutEffect(() => {
    if (Platform.OS === 'ios' && (ready || fallback))
      setOptions({
        headerBackButtonDisplayMode: shown ? backMode : 'default',
      });
  }, [setOptions, ready, fallback, shown, backMode]);
  useEffect(() => {
    if (reduceMotion !== false) {
      opacity.setValue(visible ? 1 : 0);
      return;
    }
    const fade = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: motion.duration.crossfade,
      useNativeDriver: true,
    });
    fade.start();
    return () => fade.stop();
  }, [visible, reduceMotion, opacity]);
  const {
    dynamicTypeRamp: _ramp,
    tabular: _tabular,
    ...style
  } = textStyles.inlineTitle;
  const measure =
    (text: string) =>
    (event: { nativeEvent: { lines: { width: number }[] } }) => {
      const line = event.nativeEvent.lines[0];
      if (!line || !Number.isFinite(line.width) || line.width <= 0) return;
      setMetrics((old) =>
        old[`${key}:${text}`] === line.width
          ? old
          : { ...old, [`${key}:${text}`]: line.width },
      );
    };
  const room = fallback
    ? measurement.room
    : ready && shown
      ? retreat.room
      : namedRoom;
  const shrink = fontScale > 1 && !fallback;
  return createElement(
    NativeView,
    { style: { maxWidth: room } },
    createElement(
      Animated.Text,
      {
        numberOfLines: 1,
        // Fabric only shrinks text it sees truncated, and a clipped line
        // never reads as truncated: above Large the tail mode lets
        // adjustsFontSizeToFit find the overflow (sweep 1, 2.6).
        ellipsizeMode: fallback || shrink ? 'tail' : 'clip',
        maxFontSizeMultiplier: inlineTitleScaleCap,
        // Above Large, shrink towards the Large size the retreat measured.
        ...(shrink
          ? {
              adjustsFontSizeToFit: true,
              minimumFontScale: 1 / inlineTitleScaleCap,
            }
          : {}),
        accessibilityLabel: title,
        accessibilityElementsHidden: !visible,
        importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
        testID: 'bar-title',
        style: [
          style,
          { color: colors.ink, opacity: fits ? opacity : 0, maxWidth: room },
        ],
      },
      shown && ready && !fallback ? (retreat.text ?? title) : title,
    ),
    createElement(
      ScrollView,
      {
        horizontal: true,
        testID: 'bar-title-probes',
        scrollEnabled: false,
        pointerEvents: 'none',
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        style: {
          position: 'absolute',
          width: safeWidth,
          opacity: 0,
        },
      },
      ...candidates.map((text) =>
        createElement(
          NativeText,
          {
            key: `${key}:${text}`,
            testID: 'bar-title-probe',
            // The retreat is chosen at the Large size at every larger text
            // size. Not by maxFontSizeMultiplier: RN's text measure cache
            // ignores it, and would hand these probes the drawn title's
            // layout (or the reverse). allowFontScaling is compared.
            ...(fontScale > 1
              ? { allowFontScaling: false }
              : { maxFontSizeMultiplier: inlineTitleScaleCap }),
            style,
            onTextLayout: measure(text),
          },
          text,
        ),
      ),
      backTitle
        ? createElement(
            NativeText,
            {
              key: `${key}:back`,
              testID: 'bar-back-probe',
              style: {
                fontSize: textStyles.inlineTitle.fontSize,
                fontWeight: '400',
              },
              onTextLayout: measure('back'),
            },
            backTitle,
          )
        : null,
    ),
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
 * non-collapsible title wrapper and scrolling view. iOS compares the heading's
 * measured window midpoint with the native header, including Screen.barTitle
 * via TitleAnchor. Content anchors remain available for Android adapters.
 */
export function useTitleOnScroll(
  ref: TitleRef | null,
  title?: string,
  {
    trailing = 2,
    trailingWidth,
    routeTitle = title,
    backTitle: backTitleOverride,
  }: {
    trailing?: number;
    trailingWidth?: number;
    routeTitle?: string;
    /** Must match an explicit headerBackTitle installed by the caller. */
    backTitle?: string;
  } = {},
) {
  const setOptions = useSafeSetOptions();
  const namedBackTitle = useNamedBackTitle();
  const person = useContext(NavigationRouteContext)?.name === 'person/[slug]';
  const backTitle =
    Platform.OS === 'ios' ? (backTitleOverride ?? namedBackTitle) : undefined;
  const headerHeight = useHeaderBottom();
  // The iPhone Duo's side rail (b67): the status bar, tabs and bar items sit
  // on the vertical rail, and the title in a band at the top (24-82 pt on
  // the outer display, b65), whose bottom edge is the native header height.
  // A plain string title there sat above the page's own heading at rest (the
  // double title), so the rail takes the iPhone path: hidden while the
  // heading is on screen, faded in once it has gone under the bar. On the
  // outer display UIKit folds the band away as the page scrolls (before and
  // after b67), so the page shows its heading alone. The band keeps no room
  // for items, which are on the rail.
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  const barTrailingWidth = verticalBar ? 0 : trailingWidth;
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
          ? { headerTitle: title }
          : {
              headerTitle: () =>
                createElement(BarTitle, {
                  title,
                  shown: next,
                  trailing,
                  trailingWidth: barTrailingWidth,
                  backTitle,
                  person,
                }),
            },
      );
    },
    [title, setOptions, trailing, barTrailingWidth, backTitle, person],
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
      // Hand over once the heading is mostly under the bar, at its midpoint. Short
      // pages may stop with their final line still visible. Fabric's native
      // measurement and JS offset can describe different frames, so compare
      // window coordinates only, with 1 pt slack.
      updateShown(pageY + height / 2 <= headerHeight + 1);
    });
  }, [ref, headerHeight, updateShown]);
  useLayoutEffect(() => {
    if (!title) return;
    if (!windowRef)
      shown.current = anchor !== null && offset.current + headerHeight > anchor;
    const visible = shown.current;
    setOptions({
      title: routeTitle,
      ...(Platform.OS === 'android'
        ? { headerTitle: title }
        : {
            headerTitle: () =>
              createElement(BarTitle, {
                title,
                shown: visible,
                trailing,
                trailingWidth: barTrailingWidth,
                backTitle,
                person,
              }),
          }),
    });
    installed.current = anchor !== null;
    if (windowRef && hasScrolled.current) measureHeading();
    // A response queued before a header/route change or unmount is stale.
    return invalidateMeasurements;
  }, [
    title,
    routeTitle,
    anchor,
    setOptions,
    headerHeight,
    trailing,
    barTrailingWidth,
    backTitle,
    person,
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
  // Relayout rechecks the same window boundary, without revealing at rest.
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
