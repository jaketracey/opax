import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { cloneElement } from 'react';
import type { NavigationState } from 'expo-router/react-navigation';
import { routeSheetOptions } from '../../features/sheets/frame';
import { isAccessibilityCategory } from '../../design/tokens';
import { PixelRatio } from 'react-native';
import { setSheetSegments } from '../sheets';
import { hasSourcePreview, isProduction } from '../../design/environment';
import { communityHome } from '../../features/community/entry';
import { voiceLinked } from '../../voice/linked';
import { screen, sheetOptions } from './screen';

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
    ...[
      ['source', 'Sources'],
      ['machine-note', 'Machine-written'],
      ['citation', 'Citation'],
      ['rule', 'How this is chosen'],
      ['licences', 'Sources and licences'],
    ].map(([name, title]) => (
      <Stack.Screen
        key={name}
        name={name}
        options={({ route }) => ({
          ...chrome,
          ...routeSheetOptions({
            short: name === 'machine-note' || name === 'rule',
            table:
              (route.params as { variant?: string } | undefined)?.variant ===
              'table',
            citation: name === 'citation',
            accessible: isAccessibilityCategory(PixelRatio.getFontScale()),
          }),
          ...(name === 'licences' ? { presentation: 'modal' as const } : {}),
          title,
        })}
      />
    )),
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
  ].map((element) =>
    cloneElement(element, {
      // Observe the root once through its screen listeners. This also retains
      // the modal beneath a route sheet without subscribing in every caller.
      listeners: ({
        navigation,
      }: {
        navigation: { getState: () => NavigationState };
      }) => {
        const update = () => {
          const state = navigation.getState();
          const route = state.routes[state.index];
          if (route) setSheetSegments([route.name]);
        };
        return { focus: update, state: update };
      },
    }),
  );
}
