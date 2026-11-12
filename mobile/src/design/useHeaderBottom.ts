import { useContext } from 'react';
import {
  getDefaultHeaderHeight,
  HeaderHeightContext,
} from 'expo-router/react-navigation';
import { Platform, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * Where the native header ends, in window points: status bar, bar and (while
 * expanded) the large title. A screen's scroll view runs under the header, so
 * `scrollTo({ y })` puts content y at the top of the window, behind the bar.
 * Subtract this to land just below it instead.
 * `inline` gives a switching iPhone root compact geometry immediately.
 */
export function useHeaderBottom(inline = false): number {
  const header = useContext(HeaderHeightContext);
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const frame = useWindowDimensions();
  if (inline && Platform.OS === 'ios' && !Platform.isPad && !Platform.isTV) {
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
