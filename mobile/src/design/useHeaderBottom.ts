import { useContext } from 'react';
import {
  getDefaultHeaderHeight,
  HeaderHeightContext,
} from 'expo-router/react-navigation';
import { Platform, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../modules/opax-root-bar';

/**
 * Where the native header ends, in window points: status bar, bar and (while
 * expanded) the large title. A screen's scroll view runs under the header, so
 * `scrollTo({ y })` puts content y at the top of the window, behind the bar.
 * Subtract this to land just below it instead.
 * `inline` gives a switching iPhone root compact geometry immediately.
 * A vertical bar (the iPhone Duo's folded display, status bar on the side
 * rail) never shows a large title, so the measured header is already the
 * compact bar. UIKit also sets that bar below the top edge with a 0 pt top
 * inset, so an estimate from `top` would put content under it.
 */
export function useHeaderBottom(inline = false): number {
  const header = useContext(HeaderHeightContext);
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const frame = useWindowDimensions();
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  if (
    inline &&
    !verticalBar &&
    Platform.OS === 'ios' &&
    !Platform.isPad &&
    !Platform.isTV
  ) {
    // Native-stack reports large-title heights asynchronously (and debounces
    // them). Use its compact root-bar calculation in the send render, before
    // the first turn layout or fallback frame can consume the expanded height.
    const compact = getDefaultHeaderHeight(
      frame,
      false,
      frame.width > frame.height ? 0 : top,
    );
    return Math.min(header || compact, compact);
  }
  return header || top + 44;
}
