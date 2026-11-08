import { type NativeStackNavigationOptions } from 'expo-router';
import { hasSourcePreview, isProduction } from '../../design/environment';
import { communityHome } from '../../features/community/entry';
import { voiceLinked } from '../../voice/linked';
import { screen, sheetOptions } from './screen';
import { sheetsScreens } from './sheets';

export const rootSettings = { anchor: '(tabs)' };

export function rootScreens(chrome: NativeStackNavigationOptions = {}) {
  const modal = {
    ...chrome,
    presentation: 'modal' as const,
    headerShown: false,
  };
  return [
    screen('(tabs)', 'Today', { headerShown: false }),
    screen('seat', 'Your electorate', modal),
    screen('welcome', 'Welcome', { ...modal, presentation: 'fullScreenModal' }),
    screen('talk', 'Talk to OPAX', modal, !voiceLinked),
    screen('account', 'Account', modal),
    screen('licence', 'Licence', { ...sheetOptions, headerShown: false }),
    screen('money-node', 'Money record', { headerShown: false }),
    ...sheetsScreens(),
    ...(communityHome
      ? [
          screen('community', 'Community', {
            ...modal,
            presentation: 'fullScreenModal',
          }),
        ]
      : []),
    ...(hasSourcePreview
      ? [
          screen('source-destination', 'Original', {
            ...chrome,
            ...sheetOptions,
            presentation: 'modal',
            headerShown: true,
          }),
        ]
      : []),
    ...(isProduction
      ? []
      : [
          screen('workbench', 'Workbench', {
            ...chrome,
            ...sheetOptions,
            presentation: 'fullScreenModal',
            headerShown: true,
          }),
          screen('money-map-spike', 'Money map spike', {
            ...chrome,
            headerShown: true,
          }),
        ]),
  ];
}
