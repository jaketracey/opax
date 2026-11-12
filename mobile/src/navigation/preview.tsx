import { useIsPreview, type NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useCallback, useContext, useLayoutEffect, useMemo } from 'react';
import { sheetListOptions } from './sheet-lists';
import { useDetailRouteOptions } from './useDetailRouteOptions';
import { headerItems, pendingHeaderItems } from './chrome';
import {
  useRootBarAppearance,
  useRootBarSearchOptions,
} from './useRootBarAppearance';

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
  const resolvedOptions = useMemo(
    () =>
      options &&
      pending &&
      'unstable_headerRightItems' in options &&
      !options.unstable_headerRightItems &&
      !options.headerRight
        ? { ...options, ...headerItems(() => pending) }
        : options,
    [options, pending],
  );
  const keepItems = stableItems || !!pending;
  useDetailRouteOptions(setOptions, keepItems ? resolvedOptions : undefined);
  useRootBarSearchOptions(options);
  useRootBarAppearance(setOptions, {
    names: ['bills', 'ask'],
    owner: 'options',
  });
  // Stack.Screen installs options in its own effect, outside our guard.
  // Install before paint so native items start in their final positions.
  useLayoutEffect(() => {
    // Match Expo Screen's empty-options guard (expo/router#452).
    if (!keepItems && resolvedOptions && Object.keys(resolvedOptions).length)
      setOptions(resolvedOptions);
  }, [setOptions, resolvedOptions, keepItems]);
  return null;
}
