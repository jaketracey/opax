import {
  router,
  useNavigationContainerRef,
  usePathname,
  type Href,
} from 'expo-router';
import { useEffect } from 'react';
import {
  installKeyCommands,
  requestFocus,
  sections,
  useKeyCommand,
} from '../design/keyboard';
import { useReturnFromAsk } from '../features/ask/open';
import { askSession } from '../features/ask/session';
import { askRoute } from './routes';

/**
 * The five sections in the order the tab bar draws them, for Cmd-1 to
 * Cmd-5: under Search's iOS 26 tab role Search is fifth and Ask fourth.
 */
export const sectionRoutes = sections.map((s) => s.route);

/**
 * The app-wide iPad keyboard shortcuts (iPad with a hardware keyboard; on
 * iPhone and Android nothing is installed and this renders nothing):
 * Cmd-F opens Search with its field focused, Cmd-N starts a new Ask question
 * with the composer focused (never sending anything), Cmd-1 to Cmd-5 switch
 * sections. Hold Cmd to see them listed.
 */
export function KeyboardShortcuts() {
  const path = usePathname();
  const root = useNavigationContainerRef();
  const returnFromAsk = useReturnFromAsk();
  useEffect(() => {
    installKeyCommands();
  }, []);
  useKeyCommand('stop-answer', () => askSession.stop());
  useKeyCommand('focus-composer-k', () => {
    requestFocus('ask');
    router.navigate('/ask' as Href);
  });
  useKeyCommand('focus-composer-l', () => {
    requestFocus('ask');
    router.navigate('/ask' as Href);
  });
  useKeyCommand('find', () => {
    requestFocus('search');
    router.navigate('/search' as Href);
  });
  useKeyCommand('new-question', () => {
    requestFocus('ask');
    // A question being answered keeps running; Cmd-N then only moves there.
    if (askSession.snapshot().busy) router.navigate('/ask' as Href);
    else router.navigate(askRoute({ question: '' }));
  });
  useKeyCommand('section-1', () => router.navigate(sectionRoutes[0] as Href));
  useKeyCommand('section-2', () => router.navigate(sectionRoutes[1] as Href));
  useKeyCommand('section-3', () => router.navigate(sectionRoutes[2] as Href));
  useKeyCommand('section-4', () => router.navigate(sectionRoutes[3] as Href));
  useKeyCommand('section-5', () => router.navigate(sectionRoutes[4] as Href));
  useKeyCommand('back', () => {
    // On Ask itself after an arrival from another tab, Cmd-[ goes back there.
    if (path === '/ask' && returnFromAsk()) return;
    if (router.canGoBack()) router.back();
  });
  useKeyCommand('list-escape', () => {
    if (
      /^\/(talk|account|community|seat|welcome|licence|source|citation|machine-note|rule|licences|conversations|ask-report|source-destination)(\/|$)/.test(
        path,
      )
    ) {
      const state = root.current?.getRootState();
      if (state) root.current?.dispatch({ type: 'GO_BACK', target: state.key });
    } else if (/filters|glossary/.test(path) && router.canDismiss())
      router.dismiss();
  });
  return null;
}
