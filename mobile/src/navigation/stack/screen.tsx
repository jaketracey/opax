import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import {
  closeSheetItem,
  glassBar,
  headerItems,
  largeTitleBar,
  rootHeaderItems,
  shortSheet,
  tabRootGround,
  type TabSegment,
} from '../chrome';
import { emptyBarTitle } from '../useTitleOnScroll';

/**
 * No bar title until the subject's title scrolls under the bar, with the
 * route's `title` kept for the next screen's back button. `headerTitle: ''`
 * blanked that title too, so a screen pushed from a reader or the edition
 * showed a bare chevron (wave 4 bills-15).
 */
export const untitled: NativeStackNavigationOptions =
  Platform.OS === 'ios' ? { headerTitle: emptyBarTitle } : {};

/** Stable tab and list titles, available before destination data or layout. */
const rootTitles: Record<string, string> = {
  index: 'Today',
  'your-mp': 'Your MP',
  bills: 'Bills',
  search: 'Search',
  ask: 'Ask',
  'public-money': 'Public money',
  grants: 'Commonwealth grants',
  'largest-grants': 'Largest grants',
  'grants-allocation': 'Community funding',
  agencies: 'Government agencies',
  connections: 'Programs and places',
  'money-record': 'Money record',
  'money-item': 'Money record',
  'explore/index': 'Quizzes and tools',
  'division-history': 'Votes in parliament',
};
/**
 * The back label for a screen pushed straight onto a tab root. UIKit reads
 * the root's title off its navigation item, which a link opened just after
 * launch can reach before the root has set it: the back button was then a
 * bare chevron (wave 4 money-07, 16, 18, records-01). Root titles never
 * change, so they are named outright; UIKit still shortens a label that
 * has no room. Deeper screens keep UIKit's own reading of the previous
 * title, which may be a loaded subject's name.
 */
export function rootBackTitle(
  navigation:
    | {
        getState?: () =>
          | { routes?: readonly { key?: string; name?: string }[] }
          | undefined;
      }
    | undefined,
  key: string | undefined,
  stackRootTitle?: string,
): string | undefined {
  const routes = navigation?.getState?.()?.routes ?? [];
  const at = routes.findIndex((route) => route.key === key);
  const previous = at > 0 ? routes[at - 1] : undefined;
  if (at === 1 && stackRootTitle) return stackRootTitle;
  return previous?.name ? rootTitles[previous.name] : undefined;
}

/** A modal's root has its own name, independent of the presenting tab. */
export function screenInStack(rootTitle: string) {
  return (
    name: string,
    title: string,
    options: NativeStackNavigationOptions = {},
    redirect = false,
    doneWhenRoot = false,
  ) => screen(name, title, options, redirect, doneWhenRoot, rootTitle);
}

/** Non-empty route titles also supply the next screen's named Back button. */
export function screen(
  name: string,
  title: string,
  options: NativeStackNavigationOptions = {},
  redirect = false,
  doneWhenRoot = false,
  stackRootTitle?: string,
) {
  return (
    <Stack.Screen
      key={name}
      name={name}
      redirect={redirect}
      options={({ route, navigation }) => ({
        title:
          typeof (route.params as { name?: unknown } | undefined)?.name ===
            'string' && (route.params as { name: string }).name.trim()
            ? (route.params as { name: string }).name
            : title,
        headerLargeTitleEnabled: false,
        ...(Platform.OS === 'ios' &&
        rootBackTitle(navigation, route.key, stackRootTitle)
          ? {
              headerBackTitle: rootBackTitle(
                navigation,
                route.key,
                stackRootTitle,
              ),
            }
          : {}),
        ...(doneWhenRoot && navigation?.getState().index === 0
          ? headerItems(() => [closeSheetItem()])
          : {}),
        ...options,
        ...(Platform.OS === 'android' ? { headerTitleAlign: 'left' } : {}),
      })}
    />
  );
}
export const sheetOptions: NativeStackNavigationOptions = {
  headerShown: true,
  ...shortSheet,
  ...headerItems(() => [closeSheetItem()]),
  ...(Platform.OS === 'android'
    ? { header: AndroidReadingHeader, headerRight: () => null }
    : {}),
};

export function tabRootScreen(
  segment: string,
  expected: TabSegment,
  name: string,
  title: string,
  signedIn: boolean,
) {
  return segment === expected
    ? [
        screen(name, title, {
          ...largeTitleBar(tabRootGround(name)),
          headerLargeTitleEnabled: true,
          // Translucent for the native large-title collapse on iOS 26 and
          // later only; iOS 18.4 to 25 keeps the opaque bar (shell.md 2.3).
          headerTransparent: glassBar(),
          ...headerItems(() =>
            rootHeaderItems({ segment: expected, signedIn }),
          ),
        }),
      ]
    : [];
}
