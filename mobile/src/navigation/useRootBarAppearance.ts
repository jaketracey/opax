import type { NativeStackNavigationOptions } from 'expo-router';
import {
  getDefaultHeaderHeight,
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext, useLayoutEffect, useRef } from 'react';
import { Platform, useWindowDimensions, type ColorValue } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { glassBar, largeTitleBar, opaqueBar, tabRootGround } from './chrome';

const roots = ['index', 'your-mp', 'bills', 'search', 'ask'];

/**
 * Screen supplies its ground. Bills and Ask use this from RouteOptions because
 * their FlatList/ScrollView does not use Screen. Only the collapsed/expanded
 * transition changes options, not each native header-height notification.
 * The setter must be the shared useSafeSetOptions guard.
 */
export function useRootBarAppearance(
  setOptions: (options: NativeStackNavigationOptions) => void,
  {
    ground,
    disabled = false,
    names = roots,
    largeTitleEnabled = true,
  }: {
    ground?: ColorValue;
    disabled?: boolean;
    names?: readonly string[];
    largeTitleEnabled?: boolean;
  } = {},
) {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const state = route ? navigation?.getState() : undefined;
  // Every tab uses the shared route inventory. Account and other sheet stacks
  // also have an index route, so being first in a stack is insufficient.
  const tabStack =
    state?.routeNames?.includes('bill/[key]') &&
    state.routeNames.includes('explore/[tool]');
  const root =
    !disabled &&
    glassBar() &&
    tabStack &&
    route?.key === state?.routes[0]?.key &&
    names.includes(route?.name ?? '')
      ? route
      : undefined;
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const top = useContext(SafeAreaInsetsContext)?.top ?? 0;
  const frame = useWindowDimensions();
  const pad = Platform.OS === 'ios' && Platform.isPad;
  const landscapePhone = !pad && frame.width > frame.height;
  const compactHeight = Math.max(
    getDefaultHeaderHeight(frame, false, top),
    top + (pad ? 50 : landscapePhone ? 32 : 44),
  );
  const expandedRoute = useRef<string>(undefined);
  const applied = useRef<{
    key: string;
    setter: typeof setOptions;
    colour: ColorValue;
    collapsed: boolean;
    largeTitleEnabled: boolean;
  }>(undefined);
  const colour = ground ?? tabRootGround(root?.name ?? '');
  const rootKey = root?.key;
  useLayoutEffect(() => {
    if (!rootKey) {
      applied.current = undefined;
      return;
    }
    if (headerHeight > compactHeight + 1) expandedRoute.current = rootKey;
    // NativeStack starts with an estimated inline height before UIKit reports
    // the expanded bar. Do not mistake that first estimate for a collapse.
    const collapsed =
      landscapePhone ||
      (expandedRoute.current === rootKey && headerHeight <= compactHeight + 1);
    const previous = applied.current;
    if (
      previous?.key === rootKey &&
      previous.setter === setOptions &&
      previous.colour === colour &&
      previous.collapsed === collapsed &&
      previous.largeTitleEnabled === largeTitleEnabled
    )
      return;
    setOptions(
      largeTitleEnabled ? largeTitleBar(colour, collapsed) : opaqueBar(colour),
    );
    applied.current = {
      key: rootKey,
      setter: setOptions,
      colour,
      collapsed,
      largeTitleEnabled,
    };
  }, [
    rootKey,
    setOptions,
    colour,
    headerHeight,
    compactHeight,
    landscapePhone,
    largeTitleEnabled,
  ]);
  return !!root;
}
