import type { NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext, useMemo } from 'react';
import { Platform } from 'react-native';
import { detailBackOptions } from './stack/screen';

function useBackTitleResolution() {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  return detailBackOptions(navigation, route?.key, route?.name ?? '');
}

/** The short previous-route name used by the native back item. */
export function useNamedBackTitle(): string | undefined {
  return useBackTitleResolution().headerBackTitle;
}

/** The same back settings installed by the stack before the screen mounts. */
export function useNamedBackOptions(
  mode: 'default' | 'minimal' = 'default',
): NativeStackNavigationOptions {
  const { headerBackTitle: back } = useBackTitleResolution();
  return useMemo(
    () =>
      Platform.OS === 'ios' && back
        ? {
            headerBackButtonDisplayMode: mode,
            headerBackTitle: back,
            headerBackButtonMenuEnabled: true,
          }
        : {},
    [back, mode],
  );
}
