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
  money: 'Money map',
  'public-money': 'Public money',
  grants: 'Commonwealth grants',
  'largest-grants': 'Largest grants',
  'grants-allocation': 'Community funding',
  agencies: 'Government agencies',
  connections: 'Programs and places',
  'money-record': 'Money record',
  'explore/index': 'Quizzes and tools',
  'division-history': 'Votes in parliament',
};
const loadedTitleRoutes = new Set([
  'electorate/[id]',
  'bill/[key]',
  'person/[slug]',
  'party/[slug]',
  'lead/[id]',
  'topic/[slug]',
  'doc/[slug]',
  'bill-text/[key]',
  'sources/dataset/[id]',
  '[id]',
  'grant-program',
  'agency',
  'money-item',
  'money-record',
  'connection',
]);
const doneItems = headerItems(() => [closeSheetItem()]);
/**
 * The back label for a screen pushed straight onto a tab root. UIKit reads
 * the root's title off its navigation item, which a link opened just after
 * launch can reach before the root has set it: the back button was then a
 * bare chevron (wave 4 money-07, 16, 18, records-01). Root titles never
 * change, so they are named outright; UIKit still shortens a label that
 * has no room. A detail supplies its known name, or Back while unnamed,
 * so an empty loading title never produces a bare chevron.
 */
export function rootBackTitle(
  navigation:
    | {
        getState?: () =>
          | {
              routes?: readonly {
                key?: string;
                name?: string;
                params?: { name?: unknown };
              }[];
            }
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
  if (previous?.name && loadedTitleRoutes.has(previous.name)) {
    const name = previous.params?.name;
    return typeof name === 'string' && name.trim()
      ? name.trim().replace(/\s+/g, ' ')
      : (rootTitles[previous.name] ?? 'Back');
  }
  return previous?.name ? rootTitles[previous.name] : undefined;
}

/**
 * Install a named native back item before a detail mounts. The space-aware
 * iOS back item can discard its label beside a custom (including empty)
 * title view. Disabling its menu keeps the title and chevron in a static
 * item, as the short Grants and Tools buttons already do.
 */
export function detailBackOptions(
  navigation: Parameters<typeof rootBackTitle>[0],
  key: string | undefined,
  name: string,
  stackRootTitle?: string,
): NativeStackNavigationOptions {
  if (Platform.OS !== 'ios') return {};
  const routes = navigation?.getState?.()?.routes ?? [];
  const at = routes.findIndex((route) => route.key === key);
  const previous = at > 0 ? routes[at - 1]?.name : undefined;
  const short =
    name === 'grant-program' && previous === 'grants'
      ? 'Grants'
      : (name === 'grant-program' || name === 'money-item') &&
          previous === 'explore/index'
        ? 'Tools'
        : undefined;
  const back =
    short ??
    (previous && loadedTitleRoutes.has(name)
      ? rootBackTitle(navigation, key, stackRootTitle)
      : undefined);
  return back
    ? {
        headerBackTitle: back,
        headerBackButtonDisplayMode: 'default',
        headerBackButtonMenuEnabled: false,
      }
    : {};
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
        ...detailBackOptions(navigation, route.key, name, stackRootTitle),
        ...(doneWhenRoot && navigation?.getState().index === 0
          ? doneItems
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
