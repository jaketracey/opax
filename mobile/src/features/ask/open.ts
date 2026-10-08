import { router, useSegments } from 'expo-router';
import { askRoute } from '../../navigation/routes';

type Scope = Parameters<typeof askRoute>[0];

/**
 * Opens a draft in the Ask tab; arrival never submits a paid request.
 * Inside the Ask tab's own stack, dismissTo pops back to Ask. From any other
 * tab it must navigate: dismissTo dispatches POP_TO, which the native tab
 * navigator does not handle, so the tap was silently dropped (build 17).
 */
export function useOpenAsk() {
  const inAskTab = useSegments().some((segment) => segment === '(ask)');
  return (scope: Scope) =>
    inAskTab
      ? router.dismissTo(askRoute(scope))
      : router.navigate(askRoute(scope));
}
