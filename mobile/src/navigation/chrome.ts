import { Platform, useWindowDimensions } from 'react-native';
import { router, type NativeStackHeaderItem } from 'expo-router';
import { chrome, fonts, light, navigationTitleSizes } from '../design/tokens';

/**
 * Header styling shared by every stack: Merriweather titles at the size the
 * reader's text setting gives the matching system style, and system (SF Pro)
 * buttons and back button tinted navy.
 */
// On iOS 26 a bar background or blur hides the large title (a UIKit bug,
// react-native-screens#3100), so there the system's glass bar is left alone.
// Earlier versions keep an opaque paper bar, so content never shows through.
const opaqueBar =
  Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) < 26
    ? {
        headerStyle: { backgroundColor: light.paper },
        headerLargeStyle: { backgroundColor: light.paper },
      }
    : {};

export function useStackChrome() {
  const { fontScale } = useWindowDimensions();
  const sizes = navigationTitleSizes(fontScale);
  return {
    headerTintColor: chrome.tint,
    ...opaqueBar,
    headerTitleStyle: {
      fontFamily: fonts.serif,
      fontSize: sizes.title,
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
    {
      type: 'button',
      label: 'Talk',
      accessibilityLabel: 'Talk to OPAX',
      tintColor: chrome.tint,
      icon: { type: 'sfSymbol', name: 'waveform' },
      onPress: () => router.push('/talk'),
    },
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
