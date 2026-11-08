import { router, useSegments } from 'expo-router';
import { askRoute } from '../../navigation/routes';

type Scope = Parameters<typeof askRoute>[0];

/**
 * Opens a draft in the Ask tab; arrival never submits a paid request.
 * Every arrival starts a new conversation with the draft in the composer
 * and the keyboard up; a running answer keeps running and the draft waits,
 * marked "Starts a new conversation" (journeys/ask.md 4.2).
 * Inside the Ask tab's own stack, dismissTo pops back to Ask. From any other
 * tab it must navigate: dismissTo dispatches POP_TO, which the native tab
 * navigator does not handle, so the tap was silently dropped (build 17).
 */
export function useOpenAsk() {
  const inAskTab = useSegments().some((segment) => segment === '(ask)');
  return (scope: Scope) => {
    const route = askRoute(scope);
    // Loaded at the tap: every row imports this hook, and the session
    // reaches build-bound services (api/runtime) that rows never need.
    const { arriveInAsk } =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./session') as typeof import('./session');
    arriveInAsk(scope, route.params.entry);
    if (inAskTab) router.dismissTo(route);
    else router.navigate(route);
  };
}
