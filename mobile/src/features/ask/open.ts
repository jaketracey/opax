import { router, useSegments } from 'expo-router';
import { NavigationContainerRefContext } from 'expo-router/react-navigation';
import { useContext } from 'react';
import { useOffline } from '../../api/useOffline';
import { askRoute, askTabPath } from '../../navigation/routes';

type Scope = Parameters<typeof askRoute>[0];
type Session = typeof import('./session');
type NavState = {
  key?: string;
  index?: number;
  routes?: readonly { name: string; state?: NavState }[];
};

/** The Ask tab's own stack, once the reader has opened that tab. */
export function askTabStack(state: NavState | undefined): NavState | undefined {
  for (const route of state?.routes ?? []) {
    if (route.name === '(ask)') return route.state;
    const found = askTabStack(route.state);
    if (found) return found;
  }
  return undefined;
}

// The app's navigation container. Read from React Navigation's context, as
// many tests mock expo-router's hooks.
type Container = NonNullable<
  React.ContextType<typeof NavigationContainerRefContext>
>;

/**
 * Inside the Ask tab's own stack, dismissTo pops back to Ask. From any other
 * tab it must navigate: dismissTo dispatches POP_TO, which the native tab
 * navigator does not handle, so the tap was silently dropped (build 17).
 *
 * `askTab`: switch to the Ask tab (a tapped question) rather than open Ask in
 * the browsing tab's stack (a generic "Ask about …"). Pages left open in the
 * Ask tab, such as a bill opened from an answer, close first so the tab opens
 * on Ask itself, as a tap inside the Ask tab does. The browsing tab keeps its
 * page, so one tap on its tab returns there (build 61, bug 3).
 */
function useGoToAsk(askTab?: { container: Container | undefined }) {
  const inAskTab = useSegments().some((segment) => segment === '(ask)');
  return (scope: Scope, arrive: (session: Session, entry: string) => void) => {
    const route = askRoute(scope);
    // Loaded at the tap: every row imports this hook, and the session
    // reaches build-bound services (api/runtime) that rows never need.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    arrive(require('./session') as Session, route.params.entry);
    if (inAskTab) router.dismissTo(route);
    else if (askTab) {
      const { container } = askTab;
      const stack = askTabStack(container?.getRootState() as NavState);
      if (container && stack?.key && stack.index)
        container.dispatch({ type: 'POP_TO_TOP', target: stack.key });
      router.navigate({ ...route, pathname: askTabPath });
    } else router.navigate(route);
  };
}

/**
 * A generic Ask action ("Ask about this bill", "Ask about {name}"): the
 * control shows no question, so the scope's draft goes in the composer for
 * the reader to edit and send. Every arrival starts a new conversation with
 * the keyboard up; a running answer keeps running and the draft waits,
 * marked "Starts a new conversation" (journeys/ask.md 4.2). It opens Ask in
 * the browsing tab's own stack (tests/ask-entry-navigation.test.tsx).
 */
export function useOpenAsk() {
  const go = useGoToAsk();
  return (scope: Scope) =>
    go(scope, (session, entry) => session.arriveInAsk(scope, entry));
}

/**
 * A tapped question: the row or button shows the exact question (ending in
 * "?"), so the tap switches to the Ask tab and asks it at once in a new
 * conversation (journeys/ask.md 4.2). Offline it only fills the composer.
 * See `askNow` in ./session for a running answer and VoiceOver.
 */
export function useAskNow() {
  const go = useGoToAsk({
    container: useContext(NavigationContainerRefContext),
  });
  const offline = useOffline();
  return (scope: Scope) =>
    go(scope, (session, entry) => session.askNow(scope, entry, { offline }));
}

/** True when a visible label is itself the question that would be asked. */
export const isVisibleQuestion = (label: string, question: string) =>
  label.trim() === question.trim() && /\?$/.test(question.trim());
