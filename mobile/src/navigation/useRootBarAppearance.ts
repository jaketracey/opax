import type { NativeStackNavigationOptions } from 'expo-router';
import {
  HeaderHeightContext,
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react';
import { Platform, useWindowDimensions, type ColorValue } from 'react-native';
import { useSolidBar } from '../design/accessibility';
import { RootBar, useVerticalBarEdge } from '../../modules/opax-root-bar';
import { colors } from '../design/tokens';
import { glassBar, largeTitleBar, scrollBar, tabRootGround } from './chrome';

const roots = ['index', 'your-mp', 'bills', 'search', 'ask'];
/** Roots whose Screen turns the top edge hard under scrolled text. */
const hardEdgeRoots = ['index', 'search'];

const searches = new WeakMap<
  object,
  {
    value: { largeTitle?: boolean };
    listeners: Set<() => void>;
  }
>();

function searchState(navigation: object) {
  let state = searches.get(navigation);
  if (!state) {
    state = { value: {}, listeners: new Set() };
    searches.set(navigation, state);
  }
  return state;
}

// A sibling RouteOptions can disable the title after Screen renders but
// before its layout effects run. Never apply chrome from that stale read.
function currentLargeTitle(navigation: object | undefined) {
  return !navigation || searchState(navigation).value.largeTitle !== false;
}

/**
 * RouteOptions and Screen can be siblings. Share large-title ownership
 * from the actual route options, keyed by the route's navigation object.
 * Screen remains the sole appearance owner for Search, including its changing
 * idle/results ground. Bills and Ask retain their RouteOptions owner.
 */
export function useRootBarSearchOptions(
  options: NativeStackNavigationOptions | undefined,
) {
  const navigation = useContext(NavigationContext);
  useLayoutEffect(() => {
    // Like setOptions, an omitted property leaves the existing option intact.
    if (!navigation || !options) return;
    const state = searchState(navigation);
    const value = { ...state.value };
    if ('headerLargeTitleEnabled' in options || 'headerLargeTitle' in options)
      value.largeTitle =
        options.headerLargeTitleEnabled ?? options.headerLargeTitle;
    if (state.value.largeTitle === value.largeTitle) return;
    state.value = value;
    state.listeners.forEach((listener) => listener());
  }, [navigation, options]);
}

/**
 * Screen supplies its ground. Bills and Ask use this from RouteOptions because
 * their FlatList/ScrollView does not use Screen. The five tab roots and
 * explicit large-title lists opt in; record and inline screens keep the
 * stack's opaque bar. Scrolling belongs to UIKit, never JS collapse
 * thresholds. The one scroll-driven update is `underBar` from Screen: text
 * has run under the bar, so the top edge turns hard (once each way, never
 * per frame). Today and Search on iPhone only; the iPad roots and the
 * RouteOptions owners keep the soft edge.
 * The setter must be the shared useSafeSetOptions guard.
 */
export function useRootBarAppearance(
  setOptions: (options: NativeStackNavigationOptions) => void,
  {
    ground,
    disabled = false,
    names = roots,
    owner = 'screen',
    underBar = false,
  }: {
    ground?: ColorValue;
    disabled?: boolean;
    names?: readonly string[];
    owner?: 'screen' | 'options';
    /** Screen's content has scrolled under the bar (iOS). */
    underBar?: boolean;
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
  const rootOptions = useSyncExternalStore(
    subscribe,
    () => (navigation ? searchState(navigation).value : emptyOptions),
    () => emptyOptions,
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
    ((route?.key === state?.routes[0]?.key &&
      names.includes(route?.name ?? '')) ||
      rootOptions.largeTitle === true)
      ? route
      : undefined;
  const largeTitleEnabled = !!root && (rootOptions.largeTitle ?? true);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { width, height, fontScale } = useWindowDimensions();
  const barEdge = useVerticalBarEdge();
  const verticalBar = barEdge !== 'unspecified';
  const solid = useSolidBar();
  const name = root?.name ?? '';
  const colour =
    ground ?? (roots.includes(name) ? tabRootGround(name) : colors.paper);
  const ownsBar =
    owner === 'options' ||
    rootOptions.largeTitle === undefined ||
    (name === 'search' && rootOptions.largeTitle === false);
  const rootKey = root?.key;
  const identifier = rootKey ? `opax-root-bar-${rootKey}` : undefined;
  const hardEdge =
    underBar &&
    owner === 'screen' &&
    Platform.OS === 'ios' &&
    !Platform.isPad &&
    hardEdgeRoots.includes(name);

  useLayoutEffect(() => {
    if (
      !rootKey ||
      !ownsBar ||
      largeTitleEnabled !== currentLargeTitle(navigation)
    )
      return;
    setOptions(
      largeTitleEnabled && !verticalBar
        ? {
            ...largeTitleBar(colour, solid, hardEdge),
            // Override the stack's inline default for legacy callers too.
            headerLargeTitleEnabled: true,
            unstable_nativeProps: { testID: identifier },
          }
        : scrollBar(colour, solid, barEdge),
    );
  }, [
    rootKey,
    ownsBar,
    navigation,
    setOptions,
    colour,
    solid,
    identifier,
    largeTitleEnabled,
    verticalBar,
    barEdge,
    hardEdge,
  ]);
  // A coloured UIKit appearance hides large titles on iOS 26. Only the
  // accessibility fallback needs this native sibling. Header-height updates
  // resize it, without deriving opacity or changing any route appearances.
  useLayoutEffect(() => {
    if (
      !identifier ||
      !ownsBar ||
      !currentLargeTitle(navigation) ||
      verticalBar ||
      !solid
    )
      return;
    if (navigation?.isFocused()) void RootBar?.setSolid?.(identifier, colour);
  }, [
    identifier,
    ownsBar,
    largeTitleEnabled,
    verticalBar,
    solid,
    colour,
    headerHeight,
    width,
    height,
    fontScale,
    navigation,
  ]);
  useLayoutEffect(() => {
    if (
      !identifier ||
      !ownsBar ||
      !currentLargeTitle(navigation) ||
      verticalBar ||
      !solid
    )
      return;
    const focus = navigation?.addListener('focus', () => {
      void RootBar?.setSolid?.(identifier, colour);
    });
    const clear = () => {
      void RootBar?.remove(identifier);
    };
    const blur = navigation?.addListener('blur', clear);
    return () => {
      focus?.();
      blur?.();
    };
  }, [
    identifier,
    ownsBar,
    largeTitleEnabled,
    navigation,
    verticalBar,
    solid,
    colour,
  ]);
  // Screen can hand appearance ownership to its child RouteOptions after
  // the large-title option arrives. That transfer must not remove the solid
  // sibling that the new owner has just applied. Its lifetime follows the
  // route and accessibility mode, independently of appearance ownership.
  useLayoutEffect(() => {
    if (!identifier || !currentLargeTitle(navigation) || verticalBar || !solid)
      return;
    return () => {
      void RootBar?.remove(identifier);
    };
  }, [identifier, largeTitleEnabled, navigation, verticalBar, solid]);
  return !!root;
}

const emptyOptions: { largeTitle?: boolean } = {};
