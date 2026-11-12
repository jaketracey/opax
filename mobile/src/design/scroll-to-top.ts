import { Platform } from 'react-native';

/**
 * Reset below iOS's automatically adjusted header, as Ask does. Pass the live
 * useHeaderBottom() value. On iOS with automatic insets this is ONLY valid
 * for scroll views with scrollToOverflowEnabled (Ask, KeyboardStableScreen,
 * or an explicitly opted-in Screen). Otherwise RN clamps the negative y to
 * -contentInset.top, usually zero, hiding the first content behind the bar.
 * Use this only for top resets; it does not bound arbitrary anchor targets.
 * Android's toolbar sits outside the scroll view and its top is zero.
 */
export function scrollToTop(
  scroll: {
    scrollTo?: (options: { y: number; animated: boolean }) => void;
  } | null,
  headerBottom: number,
  animated = false,
) {
  scroll?.scrollTo?.({
    y: Platform.OS === 'ios' ? -headerBottom : 0,
    animated,
  });
}
