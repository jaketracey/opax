import { router } from 'expo-router';
import { colors } from '../../design/tokens';
import { askHeaderItems, glassBar, largeTitleBar, opaqueBar } from '../chrome';
import { conversationsRoute } from '../routes/ask';
import { screen, screenInStack, sheetOptions } from './screen';

/**
 * Ask's routes in the shared tab stack. The Ask root's bar items change with
 * the conversation (New question disabled while idle or answering), so
 * AskScreen sets them; these are the first frame's.
 */
export function askScreens(segment = '', signedIn = false) {
  return [
    screen('ask', 'Ask', {
      ...(segment === '(ask)'
        ? largeTitleBar(colors.sunken)
        : opaqueBar(colors.sunken)),
      contentStyle: { backgroundColor: colors.sunken },
      headerLargeTitleEnabled: segment === '(ask)',
      headerTransparent: segment === '(ask)' && glassBar(),
      ...askHeaderItems({
        canStartNew: false,
        historyEnabled: true,
        signedIn,
        onNew: () => undefined,
        onHistory: () => router.push(conversationsRoute),
      }),
    }),
    // A1: two buttons are the only exits; a swipe down is Not now.
    screen('consent', 'Before you ask', {
      ...sheetOptions,
      sheetAllowedDetents: 'fitToContents',
      sheetGrabberVisible: true,
      contentStyle: { backgroundColor: colors.sunken },
      unstable_headerRightItems: () => [],
      headerBackVisible: false,
    }),
    // A3: a modal page sheet with its own stack (conversations/_layout.tsx).
    screen('conversations', 'Conversations', {
      presentation: 'modal',
      headerShown: false,
    }),
    screen('ask-report', 'Report this answer', {
      ...sheetOptions,
      sheetAllowedDetents: [0.5, 1],
      sheetInitialDetentIndex: 0,
      sheetGrabberVisible: true,
    }),
  ];
}
/** Account › Ask: the settings page and its Conversations, pushed in Account. */
export function askAccountScreens() {
  const screen = screenInStack('Account');
  return [screen('ask', 'Ask'), screen('conversations', 'Conversations')];
}
