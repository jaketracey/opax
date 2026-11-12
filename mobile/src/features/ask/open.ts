import { router, useSegments } from 'expo-router';
import { useOffline } from '../../api/useOffline';
import { askRoute } from '../../navigation/routes';

type Scope = Parameters<typeof askRoute>[0];
type Session = typeof import('./session');

/**
 * Inside the Ask tab's own stack, dismissTo pops back to Ask. From any other
 * tab it must navigate: dismissTo dispatches POP_TO, which the native tab
 * navigator does not handle, so the tap was silently dropped (build 17).
 */
function useGoToAsk() {
  const inAskTab = useSegments().some((segment) => segment === '(ask)');
  return (scope: Scope, arrive: (session: Session, entry: string) => void) => {
    const route = askRoute(scope);
    // Loaded at the tap: every row imports this hook, and the session
    // reaches build-bound services (api/runtime) that rows never need.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    arrive(require('./session') as Session, route.params.entry);
    if (inAskTab) router.dismissTo(route);
    else router.navigate(route);
  };
}

/**
 * A generic Ask action ("Ask about this bill", "Ask about {name}"): the
 * control shows no question, so the scope's draft goes in the composer for
 * the reader to edit and send. Every arrival starts a new conversation with
 * the keyboard up; a running answer keeps running and the draft waits,
 * marked "Starts a new conversation" (journeys/ask.md 4.2).
 */
export function useOpenAsk() {
  const go = useGoToAsk();
  return (scope: Scope) =>
    go(scope, (session, entry) => session.arriveInAsk(scope, entry));
}

/**
 * A tapped question: the row or button shows the exact question (ending in
 * "?"), so the tap opens Ask and asks it at once in a new conversation
 * (journeys/ask.md 4.2). Offline it only fills the composer. See
 * `askNow` in ./session for a running answer and VoiceOver.
 */
export function useAskNow() {
  const go = useGoToAsk();
  const offline = useOffline();
  return (scope: Scope) =>
    go(scope, (session, entry) => session.askNow(scope, entry, { offline }));
}

/** True when a visible label is itself the question that would be asked. */
export const isVisibleQuestion = (label: string, question: string) =>
  label.trim() === question.trim() && /\?$/.test(question.trim());
