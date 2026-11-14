import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Platform,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import {
  HeaderHeightContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { DescriptorsContext } from 'expo-router/build/fork/native-stack/descriptors-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVerticalBarEdge } from '../../../modules/opax-root-bar';
import { useWindowTraits } from '../../design/adaptive';
import { useSafeSetOptions } from '../../navigation/preview';

/** The sheet's own bar when the stack has not measured it yet. */
export const SHEET_HEADER = 56;

type LayoutHandler = (event: LayoutChangeEvent) => void;
/** Each fitted handler and the screen's handler it forwards to. */
const forwards = new WeakMap<LayoutHandler, LayoutHandler | undefined>();
/** A remounted sheet must not chain through its own earlier handler. */
function outer(handler: LayoutHandler | undefined) {
  return handler && forwards.has(handler) ? forwards.get(handler) : handler;
}

/**
 * Bound the scroll view by the presented native screen, not its content
 * wrapper: `fitToContents` leaves that wrapper unconstrained. An iPad form
 * sheet can stop at 640 pt inside a 1366 pt window. A window-only cap leaves
 * the buttons below the sheet with no scroll range to reach them.
 *
 * Only regular iPad windows have a sheet size independent of its content.
 * Phones, Duo and compact iPad windows must keep the window cap: feeding
 * their content-sized sheet height back into maxHeight prevents regrowth
 * after rotation, or shrinks it on every layout when the bar is vertical.
 * The native modal includes its bar, but not the window's top safe area.
 */
export function useFittedSheetHeight(): number {
  const insets = useSafeAreaInsets();
  const { width, height: window } = useWindowDimensions();
  const traits = useWindowTraits();
  const fixed =
    Platform.OS === 'ios' &&
    Platform.isPad &&
    (traits
      ? traits.horizontal === 'regular' && traits.vertical === 'regular'
      : width >= 768);
  const header = useContext(HeaderHeightContext) || SHEET_HEADER;
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  const barHeight = verticalBar ? 0 : header;
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const setOptions = useSafeSetOptions();
  const route = useContext(NavigationRouteContext);
  const descriptors = useContext(DescriptorsContext);
  const nativeProps = route
    ? descriptors[route.key]?.options.unstable_nativeProps
    : undefined;
  const previousLayout = useRef(outer(nativeProps?.onLayout));
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    previousLayout.current?.(event);
    const { height } = event.nativeEvent.layout;
    if (Number.isFinite(height) && height > 0) setSheetHeight(height);
  }, []);
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios' || nativeProps?.onLayout === onLayout) return;
    previousLayout.current = outer(nativeProps?.onLayout);
    forwards.set(onLayout, previousLayout.current);
    setOptions({ unstable_nativeProps: { ...nativeProps, onLayout } });
  }, [nativeProps, setOptions, onLayout]);
  const windowCap = Math.max(0, window - insets.top - barHeight);
  return !fixed || sheetHeight === null
    ? windowCap
    : Math.min(windowCap, Math.max(0, sheetHeight - barHeight));
}
