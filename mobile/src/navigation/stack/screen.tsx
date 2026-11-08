import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import {
  closeSheetItem,
  headerItems,
  shortSheet,
  rootHeaderItems,
  glassBar,
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

/** Non-empty route titles also supply the next screen's named Back button. */
export function screen(
  name: string,
  title: string,
  options: NativeStackNavigationOptions = {},
  redirect = false,
  doneWhenRoot = false,
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
        ...(doneWhenRoot && navigation?.getState().index === 0
          ? headerItems(() => [closeSheetItem()])
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
export function placeholderStack(screens: { name: string; title: string }[]) {
  return screens.map(({ name, title }) => screen(name, title));
}

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
