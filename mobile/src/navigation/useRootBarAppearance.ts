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
import { colors, isAccessibilityCategory } from '../design/tokens';
import {
  barBacking,
  glassBar,
  largeTitleBar,
  scrollBar,
  tabRootGround,
} from './chrome';
import { isTabStack } from './floating-bar';

const roots = ['index', 'your-mp', 'bills', 'search', 'ask'];
/** Pages whose scrolling view turns the top edge hard under scrolled text. */
const hardEdgeRoots = ['index', 'search', 'ask', 'leads'];
/** Large-title roots that take the solid native backing at AX sizes. */
const solidAtAX = ['index', 'ask'];

const searches = new WeakMap<
  object,
  {
    value: {
      largeTitle?: boolean;
      underBar?: boolean;
      search?: boolean;
      /** The page's own ground, from its Screen. */
      ground?: ColorValue;
    };
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

/** Report scroll state without owning or applying the bar's appearance. */
export function useRootBarUnderBar(underBar: boolean, enabled = true) {
  const navigation = useContext(NavigationContext);
  useLayoutEffect(() => {
    if (!navigation || !enabled) return;
    const state = searchState(navigation);
    if (state.value.underBar === underBar) return;
    state.value = { ...state.value, underBar };
    state.listeners.forEach((listener) => listener());
  }, [navigation, enabled, underBar]);
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
    // A search field in the bar: beside a vertical bar it sits below the
    // title band, outside the cover UIKit's hard top edge draws.
    if ('headerSearchBarOptions' in options)
      value.search = !!options.headerSearchBarOptions;
    if (
      state.value.largeTitle === value.largeTitle &&
      state.value.search === value.search
    )
      return;
    state.value = value;
    state.listeners.forEach((listener) => listener());
  }, [navigation, options]);
}

/**
 * Screen supplies its ground. Bills and Ask use this from RouteOptions because
 * their FlatList/ScrollView does not use Screen. The five tab roots and
 * explicit large-title lists opt in; record and inline screens keep the
 * stack's opaque bar. Scrolling belongs to UIKit, never JS collapse
 * thresholds. The one scroll-driven update is `underBar` from Screen or Ask: the
 * page has left rest, so the top edge turns hard from the first point of
 * scroll, the large-title collapse included, and soft again at rest (once
 * each way, never per frame). RouteOptions reads the scrolling view's report
 * from the shared route state when it owns the bar. Horizontal iPad bars
 * keep the soft edge; a vertical bar follows its scrolling content.
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
    /** The scrolling content has passed the bar's bottom edge (iOS). */
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
  const tabStack = isTabStack(state);
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
  const solidSetting = useSolidBar();
  const name = root?.name ?? '';
  const contentUnderBar = owner === 'screen' ? underBar : rootOptions.underBar;
  // Today's tall AX title band on a phone needs an opaque ground even when
  // neither legibility setting is on. iPad and vertical bars keep their chrome.
  // Idle Ask too: UIKit's hard edge still drew its starters, blurred, behind
  // the title and the bar buttons at AX3 (iOS 26.3). An open thread has no
  // large title and keeps its edge. The backing is for scrolled text only:
  // at rest nothing is under the bar, and on iOS 26.3 the backing drew over
  // the expanded large title, so Today rested with no title at AX sizes.
  const solid =
    solidSetting ||
    (Platform.OS === 'ios' &&
      !Platform.isPad &&
      !verticalBar &&
      largeTitleEnabled &&
      !!contentUnderBar &&
      solidAtAX.includes(name) &&
      isAccessibilityCategory(fontScale));
  // RouteOptions owns the bar of a large-title list (Leads) but knows no
  // ground; the page's Screen does, and shares it. Beside a vertical bar the
  // bar can be solid and backed, and in paper over the darker grouped page
  // it was a strip at the top at rest. Other layouts keep the colour they
  // had: there the bar is clear and the page shows through.
  const colour =
    ground ??
    (verticalBar ? rootOptions.ground : undefined) ??
    (roots.includes(name) ? tabRootGround(name) : colors.paper);
  const ownsBar =
    owner === 'options' ||
    rootOptions.largeTitle === undefined ||
    (name === 'search' && rootOptions.largeTitle === false);
  const rootKey = root?.key;
  const identifier = rootKey ? `opax-root-bar-${rootKey}` : undefined;
  useRootBarUnderBar(underBar, !!rootKey && owner === 'screen');
  useLayoutEffect(() => {
    if (!navigation || !rootKey || owner !== 'screen' || !ground) return;
    const state = searchState(navigation);
    if (state.value.ground === ground) return;
    state.value = { ...state.value, ground };
    state.listeners.forEach((listener) => listener());
  }, [navigation, rootKey, owner, ground]);
  // Beside a vertical bar a search field is stacked below the title band,
  // and UIKit's scroll edge (soft or hard) covers the band alone: the field
  // had no ground, and rows ran through it under a covered title (Bills,
  // b73). The band does not fold away while it holds a field, so such a bar
  // is solid on the page's ground, like the legibility bar: the title and
  // the field are one surface, and the list ends at the field.
  const railSearch = verticalBar && !!rootOptions.search;
  const railSolid = solid || railSearch;
  const hardEdge =
    !!contentUnderBar &&
    Platform.OS === 'ios' &&
    (verticalBar || (!Platform.isPad && hardEdgeRoots.includes(name)));

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
        : {
            ...scrollBar(
              colour,
              verticalBar ? railSolid : solid,
              barEdge,
              contentUnderBar === undefined ? undefined : hardEdge,
            ),
            // Beside a vertical bar UIKit's bar background stops short of
            // the top edge, so a solid bar there gets the page's ground.
            ...(verticalBar
              ? railSolid
                ? barBacking(colour)
                : { headerBackground: undefined }
              : {}),
          },
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
    contentUnderBar,
    railSolid,
  ]);
  // A coloured UIKit appearance hides large titles on iOS 26. The legibility
  // fallback and Today's AX band use this native sibling. Header-height updates
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

/**
 * Whether a root's bar is solid beside a vertical bar: it holds a search
 * field, or a legibility setting is on (the `railSolid` rule above). Its
 * scroll view then starts below the bar instead of running under it, which
 * Screen's pinned band needs to know. False on every other layout.
 */
export function useRailSolidRoot(): boolean {
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
  const search = useSyncExternalStore(
    subscribe,
    () => (navigation ? !!searchState(navigation).value.search : false),
    () => false,
  );
  const verticalBar = useVerticalBarEdge() !== 'unspecified';
  const solid = useSolidBar();
  return verticalBar && glassBar() && (solid || search);
}

const emptyOptions: {
  largeTitle?: boolean;
  underBar?: boolean;
  search?: boolean;
  ground?: ColorValue;
} = {};
