import { useIsPreview, type NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useCallback, useContext, useLayoutEffect } from 'react';

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
  return useCallback(
    (options: NativeStackNavigationOptions) => {
      if (!canSetOptions) return;
      try {
        navigation?.setOptions(options);
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
    [navigation, canSetOptions],
  );
}

/** Dynamic destination options only. Stack registrations keep Stack.Screen. */
export function RouteOptions({
  options,
}: {
  options?: NativeStackNavigationOptions;
}) {
  const setOptions = useSafeSetOptions();
  // Stack.Screen installs options in its own effect, outside our guard.
  // Install before paint so native items start in their final positions.
  useLayoutEffect(() => {
    // Match Expo Screen's empty-options guard (expo/router#452).
    if (options && Object.keys(options).length) setOptions(options);
  }, [setOptions, options]);
  return null;
}
