import { createElement } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, type NativeStackHeaderItem } from 'expo-router';
import {
  chrome,
  fonts,
  light,
  navigationTitleSizes,
  textStyles,
} from '../design/tokens';
import { isPad } from '../design/adaptive';

/**
 * Header styling shared by every stack: Merriweather titles at the size the
 * reader's text setting gives the matching system style, and system (SF Pro)
 * buttons and back button tinted navy.
 */
// On iOS 26 a bar background or blur hides the large title (a UIKit bug,
// react-native-screens#3100), so there the system's glass bar is left alone.
// Earlier versions keep an opaque paper bar, so content never shows through.
// Android's bar is flat paper like the redesign's: no elevation shadow.
const opaqueBar = () =>
  Platform.OS === 'android' ||
  (Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 26)
    ? {
        headerStyle: { backgroundColor: light.paper },
        headerLargeStyle: { backgroundColor: light.paper },
        ...(Platform.OS === 'android' ? { headerShadowVisible: false } : {}),
      }
    : {};

/**
 * Android bar text, in sp. The native bar sets its title in sp, so the
 * system's font scale (to 200%) applies once; passing the iOS Dynamic Type
 * size as well would scale it twice. With no large title on Android, the
 * bar title is the screen's title: the `heading` size, Material's title size.
 */
export const androidBar = {
  title: textStyles.heading.fontSize,
  action: textStyles.metadata.fontSize,
} as const;

export function useStackChrome() {
  const { fontScale } = useWindowDimensions();
  const sizes = navigationTitleSizes(fontScale);
  return {
    headerTintColor: chrome.tint,
    ...opaqueBar(),
    headerTitleStyle: {
      fontFamily: fonts.serif,
      fontSize: Platform.OS === 'android' ? androidBar.title : sizes.title,
      color: chrome.title,
    },
    headerLargeTitleStyle: {
      fontFamily: fonts.serif,
      fontSize: sizes.largeTitle,
      color: chrome.title,
    },
    headerLargeTitleShadowVisible: false,
    headerBackButtonDisplayMode: 'default' as const,
    contentStyle: { backgroundColor: light.paper },
  };
}

/**
 * Talk and Account and about: on every root screen's navigation bar. Each
 * opens a full-height sheet (src/app/talk.tsx, src/app/account.tsx).
 */
export function rootHeaderItems(): NativeStackHeaderItem[] {
  return [
    ...(Platform.OS === 'android'
      ? []
      : [
          {
            type: 'button',
            label: 'Talk',
            accessibilityLabel: 'Talk to OPAX',
            tintColor: chrome.tint,
            icon: { type: 'sfSymbol', name: 'waveform' },
            onPress: () => router.push('/talk'),
          } as NativeStackHeaderItem,
        ]),
    {
      type: 'button',
      label: 'Account',
      accessibilityLabel: 'Account and about',
      tintColor: chrome.tint,
      icon: { type: 'sfSymbol', name: 'person.crop.circle' },
      onPress: () => router.push('/account'),
    },
  ];
}

/** The item API is iOS-only. Android gets labelled, scalable touch targets. */
export function headerItems(
  items: (() => NativeStackHeaderItem[]) | undefined,
) {
  return {
    unstable_headerRightItems: items,
    ...(Platform.OS === 'android'
      ? {
          headerRight: () =>
            createElement(
              View,
              { style: { flexDirection: 'row' } },
              ...(items?.() ?? []).map((item, index) =>
                item.type === 'button'
                  ? createElement(
                      Pressable,
                      {
                        key: index,
                        testID: `header-${item.label.toLowerCase().replaceAll(' ', '-')}`,
                        accessibilityRole: 'button',
                        accessibilityLabel:
                          item.accessibilityLabel ?? item.label,
                        onPress: item.onPress,
                        hitSlop: 4,
                        style: {
                          minWidth: 48,
                          minHeight: 48,
                          justifyContent: 'center',
                          paddingHorizontal: 8,
                        },
                      },
                      createElement(
                        Text,
                        {
                          maxFontSizeMultiplier: 1.5,
                          style: {
                            color: chrome.tint,
                            fontFamily: fonts.sansSemiBold,
                            fontSize: androidBar.action,
                          },
                        },
                        item.label,
                      ),
                    )
                  : null,
              ),
            ),
        }
      : {}),
  };
}

/** The Done button that closes a sheet. */
export function closeSheetItem(): NativeStackHeaderItem {
  return {
    type: 'button',
    label: 'Done',
    variant: 'done',
    tintColor: chrome.tint,
    accessibilityLabel: 'Done',
    onPress: () => router.back(),
  };
}

/**
 * A short, single-screen sheet (filters, a glossary): a centred form sheet
 * on iPad, which UIKit turns into a bottom sheet in a compact window, and
 * the existing page sheet on iPhone. Sheets with their own stack (Account,
 * directory filters) and Talk stay `modal`: a page sheet, centred on iPad.
 */
export const shortSheet = isPad
  ? {
      presentation: 'formSheet' as const,
      sheetAllowedDetents: [1] as number[],
      sheetGrabberVisible: false,
    }
  : { presentation: 'modal' as const };
