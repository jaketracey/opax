import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../../modules/opax-root-bar';

/** The sheet's own bar when the stack has not measured it yet. */
export const SHEET_HEADER = 56;

/**
 * The tallest a `fitToContents` sheet's root may be. The sheet stops at full
 * height, but its root would keep growing with the text, so at large sizes a
 * ScrollView inside it ran below the sheet and its scroll range ended before
 * the last rows. Capped here, the scroll view ends on screen: Talk's words
 * scroll above a pinned footer (7.7), and Ask's range ends at its buttons
 * (A1).
 */
export function useFittedSheetHeight(): number {
  const insets = useSafeAreaInsets();
  const { height: window } = useWindowDimensions();
  const header = useContext(HeaderHeightContext) || SHEET_HEADER;
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  return Math.max(0, window - insets.top - (verticalBar ? 0 : header));
}
