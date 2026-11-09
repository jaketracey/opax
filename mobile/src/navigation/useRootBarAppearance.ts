import type { NativeStackNavigationOptions } from 'expo-router';
import {
  getDefaultHeaderHeight,
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Platform, useWindowDimensions, type ColorValue } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import {
  glassBar,
  largeTitleBar,
  opaqueBar,
  tabRootGround,
  todayTitleBar,
} from './chrome';

const roots = ['index', 'your-mp', 'bills', 'search', 'ask'];

// Estimate the stacked search row independently of the large title.
// Integrated/automatic fields can live in the bar or tab bar instead.
const stackedSearchHeight = 56;
// The row has not been measured on this iOS runtime, so allow 12 pt headroom.
// Even at the smallest Dynamic Type size, the expanded large title adds at
// least about 40 pt, keeping its height well above this collapsed threshold.
const stackedSearchSlack = 12;
const searches = new WeakMap<
  object,
  { pinned: boolean; listeners: Set<() => void> }
>();

function searchState(navigation: object) {
  let state = searches.get(navigation);
  if (!state) {
    state = { pinned: false, listeners: new Set() };
    searches.set(navigation, state);
  }
  return state;
}

/**
 * RouteOptions and Screen can be siblings. Share only the search row's layout
 * from the actual route options, keyed by the route's navigation object.
 * Screen remains the sole appearance owner for Search, including its changing
 * idle/results ground. Bills and Ask retain their RouteOptions owner.
 */
export function useRootBarSearchOptions(
  options: NativeStackNavigationOptions | undefined,
) {
  const navigation = useContext(NavigationContext);
  const search = options?.headerSearchBarOptions;
  const pinned =
    search?.hideWhenScrolling === false && search.placement === 'stacked';
  useLayoutEffect(() => {
    // Like setOptions, an omitted property leaves the existing option intact.
    if (!navigation || !options || !('headerSearchBarOptions' in options))
      return;
    const state = searchState(navigation);
    if (state.pinned === pinned) return;
    state.pinned = pinned;
    state.listeners.forEach((listener) => listener());
  }, [navigation, options, pinned]);
}

/**
 * Screen supplies its ground. Bills and Ask use this from RouteOptions because
 * their FlatList/ScrollView does not use Screen. Only appearance transitions
 * change options, including Today's first shrink from its expanded height.
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
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const state = searchState(navigation);
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    [navigation],
  );
  const pinnedSearch = useSyncExternalStore(
    subscribe,
    () => (navigation ? (searches.get(navigation)?.pinned ?? false) : false),
    () => false,
  );
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
  const collapsedHeight =
    compactHeight +
    (pinnedSearch ? stackedSearchHeight + stackedSearchSlack : 1);
  const expandedRoute = useRef<{
    key: string;
    collapsedHeight: number;
    expandedHeight: number;
  }>(undefined);
  const applied = useRef<{
    key: string;
    setter: typeof setOptions;
    colour: ColorValue;
    collapsed: boolean;
    largeTitleEnabled: boolean;
    todayScrolled: boolean;
  }>(undefined);
  const colour = ground ?? tabRootGround(root?.name ?? '');
  const rootKey = root?.key;
  const today = root?.name === 'index';
  useLayoutEffect(() => {
    if (!rootKey) {
      applied.current = undefined;
      return;
    }
    if (headerHeight > collapsedHeight) {
      const previous = expandedRoute.current;
      expandedRoute.current = {
        key: rootKey,
        collapsedHeight,
        // Retain the first expanded measurement for this route and threshold.
        // An overscroll stretch must not raise the reference height.
        expandedHeight:
          previous?.key === rootKey &&
          previous.collapsedHeight === collapsedHeight
            ? previous.expandedHeight
            : headerHeight,
      };
    }
    // NativeStack starts with an estimated inline height before UIKit reports
    // the expanded bar. Do not mistake that first estimate for a collapse.
    const collapsed =
      landscapePhone ||
      (expandedRoute.current?.key === rootKey &&
        expandedRoute.current.collapsedHeight === collapsedHeight &&
        headerHeight <= collapsedHeight);
    // Native layout reports the settled expanded height even if the last JS
    // scroll event was missed. Half a point ignores subpixel rounding at rest.
    const todayScrolled =
      today &&
      expandedRoute.current?.key === rootKey &&
      expandedRoute.current.collapsedHeight === collapsedHeight &&
      headerHeight < expandedRoute.current.expandedHeight - 0.5;
    const previous = applied.current;
    if (
      previous?.key === rootKey &&
      previous.setter === setOptions &&
      previous.colour === colour &&
      previous.collapsed === collapsed &&
      previous.largeTitleEnabled === largeTitleEnabled &&
      previous.todayScrolled === todayScrolled
    )
      return;
    setOptions(
      largeTitleEnabled
        ? today
          ? todayTitleBar(colour, collapsed, todayScrolled)
          : largeTitleBar(colour, collapsed)
        : opaqueBar(colour),
    );
    applied.current = {
      key: rootKey,
      setter: setOptions,
      colour,
      collapsed,
      largeTitleEnabled,
      todayScrolled,
    };
  }, [
    rootKey,
    setOptions,
    colour,
    headerHeight,
    collapsedHeight,
    landscapePhone,
    largeTitleEnabled,
    today,
  ]);
  return !!root;
}
