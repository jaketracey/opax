import { useCallback, useContext, useLayoutEffect, useState } from 'react';
import {
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../../modules/opax-root-bar';
import { useSafeSetOptions } from '../../navigation/preview';

/** The sheet's own bar when the stack has not measured it yet. */
export const SHEET_HEADER = 56;

/**
 * Bound the scroll view by the presented native screen, not its content
 * wrapper: `fitToContents` leaves that wrapper unconstrained. An iPad form
 * sheet can stop at 640 pt inside a 1366 pt window. A window-only cap leaves
 * the buttons below the sheet with no scroll range to reach them.
 *
 * The native modal screen includes its own navigation bar. Subtract that
 * bar, but not the app window's top safe area, which is outside the sheet.
 * Keep the existing window cap until layout arrives and as an upper limit
 * so phone sizing, content insets and the fit of short content stay intact.
 * Native layout updates also cover detent changes, rotation and resizing.
 */
export function useFittedSheetHeight(): number {
  const insets = useSafeAreaInsets();
  const { height: window } = useWindowDimensions();
  const header = useContext(HeaderHeightContext) || SHEET_HEADER;
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const setOptions = useSafeSetOptions();
  const onLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const { height } = nativeEvent.layout;
    if (Number.isFinite(height) && height > 0) setSheetHeight(height);
  }, []);
  useLayoutEffect(() => {
    if (Platform.OS === 'ios')
      setOptions({ unstable_nativeProps: { onLayout } });
  }, [setOptions, onLayout]);
  const windowCap = Math.max(
    0,
    window - insets.top - (verticalBar ? 0 : header),
  );
  return sheetHeight === null
    ? windowCap
    : Math.min(windowCap, Math.max(0, sheetHeight - header));
}
