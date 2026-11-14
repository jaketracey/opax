import { Stack, type NativeStackNavigationOptions } from 'expo-router';
import { cloneElement } from 'react';
import type { NavigationState } from 'expo-router/react-navigation';
import { routeSheetOptions } from '../../features/sheets/frame';
import { currentVerticalBarEdge } from '../../../modules/opax-root-bar';
import { isAccessibilityCategory } from '../../design/tokens';
import { PixelRatio, Platform } from 'react-native';
import { AndroidReadingHeader } from '../AndroidReadingHeader';
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
    // The seat chooser: a page sheet carrying its own stack, so Browse by
    // state pushes inside it (specs/your-mp.md 4.2).
    screen('seat', 'Your electorate', modal),
    // The welcome: full screen on every device, so nothing of the app shows
    // behind it before the cultural notice (first-launch 12.1, today.md 3.3;
    // overrides shell S7's iPad form sheet). No swipe dismissal: "Not now"
    // and Continue are its ways out. The first launch presents it with no
    // animation straight out of the splash; a replay slides up.
    <Stack.Screen
      key="welcome"
      name="welcome"
      options={({ route }) => ({
        ...modal,
        title: 'Welcome',
        presentation: 'fullScreenModal',
        gestureEnabled: false,
        animation:
          (route.params as { entry?: string } | undefined)?.entry === 'launch'
            ? 'none'
            : 'default',
      })}
    />,
    // A glossary term's popover at the word (features/learn/TermTip.tsx).
    screen('term-tip', 'How Parliament works', {
      presentation: 'transparentModal',
      animation: 'fade',
      headerShown: false,
      contentStyle: { backgroundColor: 'transparent' },
    }),
    screen('talk', 'Talk to OPAX', modal, !voiceLinked),
    screen('account', 'Account', modal),
    screen('licence', 'Licence', { ...sheetOptions, headerShown: false }),
    ...[
      ['source', 'Sources'],
      ['machine-note', 'Machine-written'],
      ['citation', 'Citation'],
      ['rule', 'How this is chosen'],
      ['licences', 'Sources and licences'],
      // A glossary term's answer (features/learn/TermSheet.tsx).
      ['term', 'How Parliament works'],
    ].map(([name, title]) => (
      <Stack.Screen
        key={name}
        name={name}
        options={({ route }) => ({
          ...chrome,
          ...routeSheetOptions({
            short:
              name === 'machine-note' || name === 'rule' || name === 'term',
            table:
              (route.params as { variant?: string } | undefined)?.variant ===
              'table',
            citation: name === 'citation',
            accessible:
              isAccessibilityCategory(PixelRatio.getFontScale()) ||
              currentVerticalBarEdge() !== 'unspecified',
          }),
          ...(name === 'licences'
            ? {
                presentation: 'modal' as const,
                // Android route sheets hide the native bar and draw their own;
                // Sources and licences has no frame of its own, so a deep link
                // (`opax://licences`) showed no title and no close, with the
                // statement under the status bar. It gets the Licence sheet's
                // bar: the close action and title below the status bar.
                ...(Platform.OS === 'android'
                  ? { headerShown: true, header: AndroidReadingHeader }
                  : {}),
              }
            : {}),
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
