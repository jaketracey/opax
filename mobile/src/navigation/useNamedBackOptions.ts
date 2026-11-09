import type { NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform } from 'react-native';
import { rootBackTitle } from './stack/screen';

// Keep these destinations named beside fixed titles and trailing bar items.
const shortBackTitles: Readonly<Record<string, string>> = {
  'bill-text/[key]': 'Bill text',
  'explore/index': 'Tools',
  'lead/[id]': 'Lead',
};

/** Reapply the previous route's name when a screen installs its own bar. */
export function useNamedBackOptions(): NativeStackNavigationOptions {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const routes = navigation?.getState()?.routes ?? [];
  const at = routes.findIndex((item) => item.key === route?.key);
  const previous = at > 0 ? routes[at - 1] : undefined;
  const shortBack = previous && shortBackTitles[previous.name];
  const back = shortBack ?? rootBackTitle(navigation, route?.key);
  return Platform.OS === 'ios'
    ? {
        headerBackButtonDisplayMode: 'default',
        ...(back ? { headerBackTitle: back } : {}),
        // UIKit's space-aware default can discard even an explicit short
        // title. A static native back item keeps these names beside the
        // revealed title and trailing controls, without fixing its font.
        ...(shortBack ? { headerBackButtonMenuEnabled: false } : {}),
      }
    : {};
}
