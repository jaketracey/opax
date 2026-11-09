import type { NativeStackNavigationOptions } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext } from 'react';
import { Platform } from 'react-native';
import { rootBackTitle } from './stack/screen';

/** Reapply the previous route's name when a screen installs its own bar. */
export function useNamedBackOptions(): NativeStackNavigationOptions {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const back = rootBackTitle(navigation, route?.key);
  return Platform.OS === 'ios'
    ? {
        headerBackButtonDisplayMode: 'default',
        ...(back ? { headerBackTitle: back } : {}),
      }
    : {};
}
