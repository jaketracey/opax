import { Platform } from 'react-native';

/**
 * Reset below iOS's automatically adjusted header, as Ask does. Pass the live
 * useHeaderBottom() value. Android's toolbar sits outside the scroll view.
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
