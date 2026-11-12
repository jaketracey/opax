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
import { useWindowDimensions, type ColorValue } from 'react-native';
import { useSolidBar } from '../design/accessibility';
import { RootBar, useVerticalBarEdge } from '../../modules/opax-root-bar';
import { colors } from '../design/tokens';
import { glassBar, largeTitleBar, scrollBar, tabRootGround } from './chrome';

const roots = ['index', 'your-mp', 'bills', 'search', 'ask'];

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
 * their FlatList/ScrollView does not use Screen. Explicit large-title list
 * destinations also use RouteOptions; Screen defers to that owner. Scrolling
 * belongs to UIKit, never JS collapse thresholds or route appearance updates.
 * The setter must be the shared useSafeSetOptions guard.
 */
export function useRootBarAppearance(
  setOptions: (options: NativeStackNavigationOptions) => void,
  {
    ground,
    disabled = false,
    names = roots,
    owner = 'screen',
    includeInline = false,
  }: {
    ground?: ColorValue;
    disabled?: boolean;
    names?: readonly string[];
    owner?: 'screen' | 'options';
    includeInline?: boolean;
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
  const inline =
    !disabled && glassBar() && includeInline && !root ? route : undefined;
  const largeTitleEnabled = !!root && (rootOptions.largeTitle ?? true);
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { width, height, fontScale } = useWindowDimensions();
  const barEdge = useVerticalBarEdge();
  const verticalBar = barEdge !== 'unspecified';
  const solid = useSolidBar();
  const name = root?.name ?? '';
  const colour =
    ground ??
    (roots.includes(name) || name === 'leads'
      ? tabRootGround(name)
      : colors.paper);
  const ownsBar = owner === 'options' || rootOptions.largeTitle === undefined;
  const rootKey = root?.key ?? inline?.key;
  const identifier = rootKey ? `opax-root-bar-${rootKey}` : undefined;

  useLayoutEffect(() => {
    if (!rootKey || !ownsBar) return;
    setOptions(
      largeTitleEnabled && !verticalBar
        ? {
            ...largeTitleBar(colour, solid),
            // Override the stack's inline default for legacy callers too.
            headerLargeTitleEnabled: true,
            unstable_nativeProps: { testID: identifier },
          }
        : scrollBar(colour, solid, barEdge),
    );
  }, [
    rootKey,
    ownsBar,
    setOptions,
    colour,
    solid,
    identifier,
    largeTitleEnabled,
    verticalBar,
    barEdge,
  ]);
  // A coloured UIKit appearance hides large titles on iOS 26. Only the
  // accessibility fallback needs this native sibling. Header-height updates
  // resize it, without deriving opacity or changing any route appearances.
  useLayoutEffect(() => {
    if (!identifier || !ownsBar || !largeTitleEnabled || verticalBar || !solid)
      return;
    if (navigation?.isFocused()) void RootBar?.setSolid(identifier, colour);
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
    if (!identifier || !ownsBar || !largeTitleEnabled || verticalBar || !solid)
      return;
    const focus = navigation?.addListener('focus', () => {
      void RootBar?.setSolid(identifier, colour);
    });
    const clear = () => {
      void RootBar?.remove(identifier);
    };
    const blur = navigation?.addListener('blur', clear);
    return () => {
      focus?.();
      blur?.();
      clear();
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
  return !!root;
}

const emptyOptions: { largeTitle?: boolean } = {};
