import { router, useSegments, type Href } from 'expo-router';
import { NavigationContainerRefContext } from 'expo-router/react-navigation';
import { useCallback, useContext } from 'react';
import { useOffline } from '../../api/useOffline';
import { askRoute, askTabPath } from '../../navigation/routes';
import {
  askReturnSnapshot,
  setAskReturn,
  shortReturnName,
  sourceTab,
  sourceTabNames,
} from './return';

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

/** The tab navigator's own state: the one whose routes include Ask's tab. */
export function tabsState(state: NavState | undefined): NavState | undefined {
  if (state?.routes?.some((route) => route.name === '(ask)')) return state;
  for (const route of state?.routes ?? []) {
    const found = tabsState(route.state);
    if (found) return found;
  }
  return undefined;
}

/**
 * Every arrival from outside the Ask tab switches to it (journeys/ask.md
 * 4.2). Pages left open in the Ask tab, such as a bill opened from an
 * answer, close first so the tab opens on Ask itself, as a tap inside the
 * Ask tab does. The browsing tab keeps its page, and Ask's bar offers the
 * way back to it (`useReturnFromAsk`).
 *
 * Inside the Ask tab's own stack (a record pushed from an answer, or drawn
 * in Ask's sources pane beside the conversation), dismissTo pops back to
 * Ask: no tab switch and no way back to add. From any other tab it must
 * navigate: dismissTo dispatches POP_TO, which the native tab navigator does
 * not handle, so the tap was silently dropped (build 17).
 *
 * `from`: the source page's name for the back item; without one the item
 * names the source tab.
 */
function useGoToAsk() {
  const segments = useSegments() as string[];
  const inAskTab = segments.some((segment) => segment === '(ask)');
  const source = sourceTab(segments[0] === '(tabs)' ? segments[1] : undefined);
  // The app's navigation container, from React Navigation's context, as
  // many tests mock expo-router's hooks.
  const container = useContext(NavigationContainerRefContext);
  return (
    scope: Scope,
    arrive: (session: Session, entry: string) => void,
    from?: string,
  ) => {
    const route = askRoute(scope);
    // Loaded at the tap: every row imports this hook, and the session
    // reaches build-bound services (api/runtime) that rows never need.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    arrive(require('./session') as Session, route.params.entry);
    if (inAskTab) {
      router.dismissTo(route);
      return;
    }
    const stack = askTabStack(container?.getRootState() as NavState);
    if (container && stack?.key && stack.index)
      container.dispatch({ type: 'POP_TO_TOP', target: stack.key });
    // Set before the switch: the tab layout ends it on any other tab.
    setAskReturn(
      source
        ? {
            tab: source,
            name: from?.trim() || sourceTabNames[source],
            short: shortReturnName(source, segments),
          }
        : null,
    );
    router.navigate({ ...route, pathname: askTabPath });
  };
}

/**
 * Ask's way back to the page an arrival came from: switches to that tab,
 * whose stack still holds the page as it was. False when there is none.
 */
export function useReturnFromAsk() {
  const container = useContext(NavigationContainerRefContext);
  return useCallback(() => {
    const target = askReturnSnapshot();
    if (!target) return false;
    setAskReturn(null);
    const tabs = tabsState(container?.getRootState() as NavState);
    if (container && tabs?.key)
      container.dispatch({
        type: 'JUMP_TO',
        target: tabs.key,
        payload: { name: target.tab },
      });
    else router.navigate(`/(tabs)/${target.tab}` as Href);
    return true;
  }, [container]);
}

/**
 * A generic Ask action ("Ask about this bill", "Ask about {name}"): the
 * control shows no question, so the scope's draft goes in the composer for
 * the reader to edit and send. It switches to the Ask tab, with a way back
 * to the page (`from` names it). Every arrival starts a new conversation
 * with the keyboard up; a running answer keeps running and the draft waits,
 * marked "Starts a new conversation" (journeys/ask.md 4.2,
 * tests/ask-entry-navigation.test.tsx).
 */
export function useOpenAsk() {
  const go = useGoToAsk();
  return (scope: Scope, from?: string) =>
    go(scope, (session, entry) => session.arriveInAsk(scope, entry), from);
}

/**
 * A tapped question: the row or button shows the exact question (ending in
 * "?"), so the tap switches to the Ask tab and asks it at once in a new
 * conversation (journeys/ask.md 4.2). Offline it only fills the composer.
 * See `askNow` in ./session for a running answer and VoiceOver.
 */
export function useAskNow() {
  const go = useGoToAsk();
  const offline = useOffline();
  return (scope: Scope, from?: string) =>
    go(
      scope,
      (session, entry) => session.askNow(scope, entry, { offline }),
      from,
    );
}

/** True when a visible label is itself the question that would be asked. */
export const isVisibleQuestion = (label: string, question: string) =>
  label.trim() === question.trim() && /\?$/.test(question.trim());
