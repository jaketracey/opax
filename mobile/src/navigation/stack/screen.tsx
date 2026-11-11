import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import {
  closeSheetItem,
  glassBar,
  headerItems,
  largeTitleBar,
  pendingHeaderOptions,
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
export const untitled: NativeStackNavigationOptions = {
  headerTitle: Platform.OS === 'ios' ? emptyBarTitle : '',
};

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
  leads: 'Leads',
  discover: 'Leads',
  'money-donors': 'Donors',
  'funding-by-seat-type': 'Funding by seat type',
  'agency-list': 'Agency records',
  'bill-list': 'Bills',
  'recent-records': 'Just added',
  'record-list': 'Records',
  'person/[slug]/votes': 'Voting record',
  'person/[slug]/speeches': 'Speeches',
  'person/[slug]/interests': 'Declared interests',
  'party-sources': 'Largest sources by year',
  declarations: 'Just declared',
  topics: 'Topics',
  edition: 'Daily edition',
  follows: 'Following',
  about: 'About OPAX',
  coverage: 'Coverage',
  stats: 'Coverage',
  methods: 'Methods',
  'sources/index': 'Sources and licences',
  'sources/[...path]': 'Sources and licences',
  'sources/datasets': 'Datasets',
  'sources/portraits': 'Portraits',
  'sources/photos': 'Time machine photographs',
  'sources/fonts': 'Fonts',
  consent: 'Voice consent',
  'sign-in': 'Sign in',
  'sign-in/code': 'Check your email',
  delete: 'Delete account',
  'delete/code': 'Deletion code',
  conversations: 'Conversations',
  'state/[code]': 'Electorates',
  'seat/index': 'Your electorate',
  'seat/state/[code]': 'Electorates',
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
                params?: { name?: unknown; kind?: unknown };
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
  if (previous?.name === 'directory') {
    return previous.params?.kind === 'party'
      ? 'Parties'
      : previous.params?.kind === 'electorate'
        ? 'Electorates'
        : 'People';
  }
  if (previous?.name && loadedTitleRoutes.has(previous.name)) {
    const name = previous.params?.name;
    return typeof name === 'string' && name.trim()
      ? name.trim().replace(/\s+/g, ' ')
      : (rootTitles[previous.name] ?? 'Back');
  }
  return previous?.name ? rootTitles[previous.name] : undefined;
}

/**
 * Resolve the back item before a screen mounts. Keep UIKit's space-aware
 * item so long names shorten to Back and header updates do not replace it.
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
      : previous === 'explore/index'
        ? 'Tools'
        : undefined;
  // An unlisted source can have a live title (for example Senators). An
  // explicit undefined lets UIKit read that title instead of inheriting Back.
  const back = short ?? rootBackTitle(navigation, key, stackRootTitle);
  return previous
    ? {
        headerBackTitle: back,
        headerBackButtonDisplayMode: 'default',
        headerBackButtonMenuEnabled: true,
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
        ...detailBackOptions(navigation, route.key, name, stackRootTitle),
        ...pendingHeaderOptions(name, route.params),
        ...(doneWhenRoot && navigation?.getState().index === 0
          ? doneItems
          : {}),
        ...options,
      })}
    />
  );
}
export const sheetOptions: NativeStackNavigationOptions = {
  headerShown: true,
  ...shortSheet,
  ...headerItems(() => [closeSheetItem()]),
  ...(Platform.OS === 'android' ? { header: AndroidReadingHeader } : {}),
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
