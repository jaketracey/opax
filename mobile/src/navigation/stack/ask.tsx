import { rootHeaderItems, headerItems } from '../chrome';
import { Platform } from 'react-native';
import { screen, sheetOptions } from './screen';

export function askScreens(segment = '', signedIn = false) {
  return [
    screen('ask', 'Ask', {
      headerLargeTitleEnabled: segment === '(ask)',
      headerTransparent: segment === '(ask)' && Platform.OS === 'ios',
      ...headerItems(() => rootHeaderItems({ segment: '(ask)', signedIn })),
    }),
    screen('consent', 'Before you ask', {
      ...sheetOptions,
      sheetAllowedDetents: 'fitToContents',
      ...headerItems(undefined),
      headerBackVisible: false,
    }),
    screen('filters/ask', 'Options', { ...sheetOptions, headerShown: false }),
    screen('conversations', 'Your conversations', {
      presentation: 'modal',
      headerShown: false,
    }),
    screen('ask-report', 'Report a problem', sheetOptions),
  ];
}
export function askAccountScreens() {
  return [screen('ask', 'Ask'), screen('conversations', 'Your conversations')];
}
