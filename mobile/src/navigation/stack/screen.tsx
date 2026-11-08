import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
import {
  closeSheetItem,
  headerItems,
  shortSheet,
  rootHeaderItems,
  type TabSegment,
} from '../chrome';

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
          headerTransparent: Platform.OS === 'ios',
          ...headerItems(() =>
            rootHeaderItems({ segment: expected, signedIn }),
          ),
        }),
      ]
    : [];
}
