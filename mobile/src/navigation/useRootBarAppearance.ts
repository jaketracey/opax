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
import { RootBar } from '../../modules/opax-root-bar';
import { colors } from '../design/tokens';
import { glassBar, largeTitleBar, opaqueBar, tabRootGround } from './chrome';

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
  {
    value: { pinned: boolean; largeTitle?: boolean };
    listeners: Set<() => void>;
  }
>();

function searchState(navigation: object) {
  let state = searches.get(navigation);
  if (!state) {
    state = { value: { pinned: false }, listeners: new Set() };
    searches.set(navigation, state);
  }
  return state;
}

/**
 * RouteOptions and Screen can be siblings. Share the search row's layout
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
    if (!navigation || !options) return;
    const state = searchState(navigation);
    const value = { ...state.value };
    if ('headerSearchBarOptions' in options) value.pinned = pinned;
    if ('headerLargeTitleEnabled' in options || 'headerLargeTitle' in options)
      value.largeTitle =
        options.headerLargeTitleEnabled ?? options.headerLargeTitle;
    if (
      state.value.pinned === value.pinned &&
      state.value.largeTitle === value.largeTitle
    )
      return;
    state.value = value;
    state.listeners.forEach((listener) => listener());
  }, [navigation, options, pinned]);
}

/**
 * Screen supplies its ground. Bills and Ask use this from RouteOptions because
 * their FlatList/ScrollView does not use Screen. Explicit large-title list
 * destinations also use RouteOptions; Screen defers to that owner. Scrolling
 * only updates a native backing, never route appearances.
 * The setter must be the shared useSafeSetOptions guard.
 */
export function useRootBarAppearance(
  setOptions: (options: NativeStackNavigationOptions) => void,
  {
    ground,
    disabled = false,
    names = roots,
    owner = 'screen',
  }: {
    ground?: ColorValue;
    disabled?: boolean;
    names?: readonly string[];
    owner?: 'screen' | 'options';
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
  const pinnedSearch = rootOptions.pinned;
  const largeTitleEnabled = rootOptions.largeTitle ?? true;
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
    fontScale: number;
    width: number;
    height: number;
  }>(undefined);
  const applied = useRef<{
    key: string;
    setter: typeof setOptions;
    colour: ColorValue;
    largeTitleEnabled: boolean;
  }>(undefined);
  const name = root?.name ?? '';
  const colour =
    ground ??
    (roots.includes(name) || name === 'leads'
      ? tabRootGround(name)
      : colors.paper);
  const ownsBar = owner === 'options' || rootOptions.largeTitle === undefined;
  const rootKey = root?.key;
  const identifier = rootKey ? `opax-root-bar-${rootKey}` : undefined;
  const nativeValues = useRef({ progress: 0, colour });
  useLayoutEffect(() => {
    if (!rootKey || !ownsBar) {
      applied.current = undefined;
      return;
    }
    if (headerHeight > collapsedHeight) {
      const previous = expandedRoute.current;
      expandedRoute.current = {
        key: rootKey,
        collapsedHeight,
        fontScale: frame.fontScale,
        width: frame.width,
        height: frame.height,
        // Retain the first expanded measurement until the route, threshold,
        // font scale or window size changes. Overscroll must not raise it.
        expandedHeight:
          previous?.key === rootKey &&
          previous.collapsedHeight === collapsedHeight &&
          previous.fontScale === frame.fontScale &&
          previous.width === frame.width &&
          previous.height === frame.height
            ? previous.expandedHeight
            : headerHeight,
      };
    }
    const reference = expandedRoute.current;
    const sameLayout =
      reference?.key === rootKey &&
      reference?.collapsedHeight === collapsedHeight &&
      reference?.fontScale === frame.fontScale &&
      reference?.width === frame.width &&
      reference?.height === frame.height;
    // Header height is UIKit's collapse offset, including search-field motion.
    // Ignore rounding at rest and clamp overscroll. Initial inline estimates
    // have no expanded reference and must leave the title clear.
    const collapsed =
      landscapePhone ||
      (reference?.key === rootKey &&
        reference.collapsedHeight === collapsedHeight &&
        headerHeight <= collapsedHeight);
    const progress = collapsed
      ? 1
      : sameLayout && reference
        ? Math.min(
            1,
            Math.max(
              0,
              (reference.expandedHeight - headerHeight - 0.5) /
                Math.max(1, reference.expandedHeight - collapsedHeight - 0.5),
            ),
          )
        : 0;
    nativeValues.current = { progress, colour };
    if (identifier && largeTitleEnabled && navigation?.isFocused())
      void RootBar?.update(identifier, progress, colour, colors.dividerSubtle);
    const previous = applied.current;
    if (
      previous?.key === rootKey &&
      previous.setter === setOptions &&
      previous.colour === colour &&
      previous.largeTitleEnabled === largeTitleEnabled
    )
      return;
    setOptions(
      largeTitleEnabled
        ? {
            ...largeTitleBar(colour),
            // Legacy headerLargeTitle callers must also override the stack's
            // explicit inline default, which takes precedence in Expo Router.
            headerLargeTitleEnabled: true,
            unstable_nativeProps: { testID: identifier },
          }
        : opaqueBar(colour),
    );
    applied.current = {
      key: rootKey,
      setter: setOptions,
      colour,
      largeTitleEnabled,
    };
  }, [
    rootKey,
    setOptions,
    colour,
    headerHeight,
    collapsedHeight,
    ownsBar,
    identifier,
    largeTitleEnabled,
    navigation,
    landscapePhone,
    frame.fontScale,
    frame.width,
    frame.height,
  ]);
  useLayoutEffect(() => {
    if (!identifier || !ownsBar || !largeTitleEnabled) return;
    const focus = navigation?.addListener('focus', () => {
      const { progress, colour } = nativeValues.current;
      void RootBar?.update(identifier, progress, colour, colors.dividerSubtle);
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
  }, [identifier, ownsBar, largeTitleEnabled, navigation]);
  return !!root;
}

const emptyOptions: { pinned: boolean; largeTitle?: boolean } = {
  pinned: false,
};
