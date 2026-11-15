import { useIsPreview, type NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useCallback, useContext, useLayoutEffect, useMemo } from 'react';
import type { ColorValue } from 'react-native';
import { sheetListOptions } from './sheet-lists';
import { usePageUnavailable } from './page-unavailable';
import {
  usePushedPlainClear,
  usePushedRailBar,
  useSolidRailBacking,
} from './solid-rail';
import { useDetailRouteOptions } from './useDetailRouteOptions';
import {
  barBacking,
  clearBarStyle,
  groundBar,
  headerItems,
  pendingHeaderItems,
  useClearRailBar,
} from './chrome';
import {
  useRootBarAppearance,
  useRootBarSearchOptions,
  useScreenGround,
} from './useRootBarAppearance';
import { colors } from '../design/tokens';

/** Preview destinations have placeholder navigation that rejects options. */
export function useCanSetOptions() {
  const preview = useIsPreview();
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  // Expo can mount a destination with placeholder navigation before supplying
  // PreviewRouteContext. Its route is not registered in the owning navigator.
  return (
    !preview &&
    (!route ||
      navigation?.getState()?.routes.some((item) => item.key === route.key))
  );
}

export function useSafeSetOptions() {
  const navigation = useContext(NavigationContext);
  const canSetOptions = useCanSetOptions();
  const routeName = useContext(NavigationRouteContext)?.name;
  return useCallback(
    (options: NativeStackNavigationOptions) => {
      if (!canSetOptions) return;
      try {
        navigation?.setOptions(
          sheetListOptions(options, routeName, navigation.getState?.()?.index),
        );
      } catch (error) {
        // Also cover placeholders whose route context still names a real
        // route. Do not hide option errors from an ordinary screen.
        if (
          !(error instanceof Error) ||
          error.message !== 'Options cannot be set from a placeholder screen.'
        )
          throw error;
      }
    },
    [navigation, canSetOptions, routeName],
  );
}

/** Dynamic destination options only. Stack registrations keep Stack.Screen. */
export function RouteOptions({
  options,
  stableItems = false,
}: {
  options?: NativeStackNavigationOptions;
  /** A detail's bar items retain their identity as data and title arrive. */
  stableItems?: boolean;
}) {
  const setOptions = useSafeSetOptions();
  const route = useContext(NavigationRouteContext);
  const pending = useMemo(
    () => pendingHeaderItems(route?.name, route?.params),
    [route?.name, route?.params],
  );
  // A page that sets its own bar colour (the glossary's paper bar) loses it
  // under the clear rail bar, as Screen's does (clearBarStyle).
  useRootBarSearchOptions(options);
  const root = useRootBarAppearance(setOptions, {
    names: ['bills', 'ask'],
    owner: 'options',
  });
  const clearRail = useClearRailBar();
  const solidRail = useSolidRailBacking();
  // A pushed page beside the rail, unless a root-style owner has its bar.
  const pushedRail = usePushedRailBar();
  // The same page on any other iOS 26 layout, under the stack's clear bar.
  const plainClear = usePushedPlainClear();
  const screenGround = useScreenGround();
  // Beside a vertical bar the stand-ins are dimmed buttons (chrome.ts). A
  // page showing a whole-page unavailable state will never replace them,
  // so they are cleared: only Back stays on the rail.
  const unavailable = usePageUnavailable();
  const clearStandIns =
    unavailable && !!pending?.some((item) => item.type !== 'spacing');
  const resolvedOptions = useMemo(() => {
    const resolved =
      clearStandIns &&
      !options?.unstable_headerRightItems &&
      !options?.headerRight
        ? { ...options, ...headerItems(() => []) }
        : options &&
            pending &&
            'unstable_headerRightItems' in options &&
            !options.unstable_headerRightItems &&
            !options.headerRight
          ? { ...options, ...headerItems(() => pending) }
          : options;
    if (!resolved) return resolved;
    const own = (
      resolved.headerStyle as { backgroundColor?: ColorValue } | undefined
    )?.backgroundColor;
    // A search field is stacked below the title band on the rail, outside
    // what UIKit's scroll edge covers, so rows ran through it under a
    // covered title (the pushed Bills list, b74). Like a rail root's, such a
    // bar is solid on the page's own ground: one surface for title and field.
    // Off the rail UIKit's bar holds the field inside the height the fade
    // covers, so a page there keeps the clear bar and its fade. Only a
    // route the stack laid out below its bar (a list with pinned section
    // headers) stays there, in the page's ground with no hairline.
    if (
      (pushedRail === 'clear' || plainClear) &&
      !root &&
      'headerSearchBarOptions' in resolved
    )
      return resolved.headerSearchBarOptions && !(plainClear && clearRail)
        ? {
            ...resolved,
            headerTransparent: false,
            ...(plainClear
              ? groundBar(own ?? screenGround ?? colors.paper)
              : barBacking(own ?? screenGround ?? colors.paper)),
          }
        : {
            ...clearBarStyle(resolved),
            headerTransparent: true,
            headerBackground: undefined,
          };
    if (clearRail) return clearBarStyle(resolved);
    // Under the solid rail bar a page's own bar colour is backed in that
    // colour: the glossary's paper bar had 14 pt of the darker page above it.
    return solidRail && own ? { ...resolved, ...barBacking(own) } : resolved;
  }, [
    options,
    pending,
    clearStandIns,
    clearRail,
    solidRail,
    pushedRail,
    plainClear,
    root,
    screenGround,
  ]);
  const keepItems = stableItems || !!pending;
  useDetailRouteOptions(setOptions, keepItems ? resolvedOptions : undefined);
  // Stack.Screen installs options in its own effect, outside our guard.
  // Install before paint so native items start in their final positions.
  useLayoutEffect(() => {
    // Match Expo Screen's empty-options guard (expo/router#452).
    if (!keepItems && resolvedOptions && Object.keys(resolvedOptions).length)
      setOptions(resolvedOptions);
  }, [setOptions, resolvedOptions, keepItems]);
  return null;
}
