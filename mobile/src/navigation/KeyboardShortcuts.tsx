import { useEffect } from 'react';
import {
  router,
  useNavigationContainerRef,
  usePathname,
  type Href,
} from 'expo-router';
import {
  installKeyCommands,
  requestFocus,
  useKeyCommand,
} from '../design/keyboard';
import { askSession } from '../features/ask/session';
import { askRoute } from './routes';

/** The five sections, in sidebar order, for Cmd-1 to Cmd-5. */
export const sectionRoutes = [
  '/',
  '/your-mp',
  '/bills',
  '/search',
  '/ask',
] as const;

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
  useEffect(() => {
    installKeyCommands();
  }, []);
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
    if (router.canGoBack()) router.back();
  });
  useKeyCommand('list-escape', () => {
    if (/^\/(talk|account|community)(\/|$)/.test(path)) {
      const state = root.current?.getRootState();
      if (state) root.current?.dispatch({ type: 'GO_BACK', target: state.key });
    } else if (/filters|glossary/.test(path) && router.canDismiss())
      router.dismiss();
  });
  return null;
}
