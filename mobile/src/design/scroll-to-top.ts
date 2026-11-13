import { Platform } from 'react-native';

type Measurable = {
  measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

/**
 * Reset to the scroll view's resting top, just below iOS's automatically
 * adjusted header, as Ask does. Pass the live useHeaderBottom() value.
 *
 * The rest offset is minus the part of the header that lies over the scroll
 * view, and that depends on the route's bar. A tab root's translucent or
 * large-title bar lies over a scroll view that starts at the window's top,
 * so the rest is -headerBottom. A pushed screen's opaque bar does not:
 * react-native-screens lays the content out below it (RNSScreen.mm
 * updateBounds), so the rest is 0, and -headerBottom left a blank band the
 * header's height above the first content (build 63, flow 48: the quiz).
 * The scroll view's top in the window says which. Fabric measures it
 * synchronously from the committed shadow tree, the screen's header offset
 * included. Without a reading (a test double, a detached view), it assumes
 * the scroll view starts at the window's top, under the header.
 *
 * On iOS with automatic insets a negative rest is ONLY reachable for scroll
 * views with scrollToOverflowEnabled (Ask, KeyboardStableScreen, or an
 * explicitly opted-in Screen). Otherwise RN clamps the negative y to
 * -contentInset.top, usually zero, hiding the first content behind the bar.
 * Use this only for top resets; it does not bound arbitrary anchor targets.
 * A list's scroll responder is measured through its native scroll view.
 * Android's toolbar sits outside the scroll view and its top is zero.
 */
type TopScroll = Measurable & {
  scrollTo?: (options: { y: number; animated: boolean }) => void;
  getNativeScrollRef?: () => Measurable | null | undefined;
};

export function scrollToTop(
  scroll: TopScroll | null,
  headerBottom: number,
  animated = false,
) {
  if (!scroll?.scrollTo) return;
  scroll.scrollTo({ y: restOffset(scroll, headerBottom), animated });
}

/**
 * The offset scrollToTop lands on: the scroll view's resting top. Callers
 * that skip a reset when the page is already there compare against this,
 * not -headerBottom, which is the rest only under the header.
 */
export function restOffset(scroll: TopScroll | null, headerBottom: number) {
  if (Platform.OS !== 'ios') return 0;
  const over = scroll ? headerOver(scroll, headerBottom) : headerBottom;
  return over ? -over : 0;
}

/** How much of the header, in points, lies over the scroll view's top. */
function headerOver(
  scroll: Measurable & {
    getNativeScrollRef?: () => Measurable | null | undefined;
  },
  headerBottom: number,
) {
  const view = scroll.getNativeScrollRef?.() ?? scroll;
  const measured: { top?: number } = {};
  view.measureInWindow?.((_x, y) => {
    measured.top = y;
  });
  const { top } = measured;
  if (top === undefined || !Number.isFinite(top)) return headerBottom;
  return Math.min(headerBottom, Math.max(0, headerBottom - top));
}
