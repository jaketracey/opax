import { CommonActions } from 'expo-router/react-navigation';

type State = {
  key?: string;
  type?: string;
  routes: readonly { state?: unknown }[];
  preloadedRoutes?: readonly unknown[];
};
type Container = {
  isReady(): boolean;
  getRootState(): unknown;
  dispatch(action: object): void;
};

let container: Container | null = null;

/** The root layout registers the navigation container once it exists. */
export function setLinkContainer(next: Container | null) {
  container = next;
}

function stacksWithPreloads(state: State | undefined, found: State[] = []) {
  if (!state?.routes) return found;
  if (state.type === 'stack' && state.key && state.preloadedRoutes?.length)
    found.push(state);
  for (const route of state.routes)
    stacksWithPreloads(route.state as State | undefined, found);
  return found;
}

/**
 * Drops the routes a row's native preview left preloaded, before a link that
 * arrives while the app is open is routed.
 *
 * A preview preloads its destination in the tab's stack and leaves it there
 * when it closes without being opened (a long press that turns into a
 * scroll does this). Expo Router 57.0.24 then matches an incoming link to
 * the same route name against that preloaded route, and because the link's
 * action pops to an existing route, it finds none in the stack and adds
 * nothing: a link to a bill from the Bills tab opened no page at all
 * (backlog D-billlink, seen on the Duo's outer display). The list's own
 * route and scroll position are kept; only the unused preloads go.
 *
 * True when something was dropped: the caller then lets that state commit
 * before the link's own action is built against it.
 */
export function dropStalePreviews(): boolean {
  if (!container?.isReady()) return false;
  const stacks = stacksWithPreloads(container.getRootState() as State);
  for (const state of stacks)
    container.dispatch({
      ...CommonActions.reset({ ...state, preloadedRoutes: [] } as never),
      target: state.key,
    });
  return stacks.length > 0;
}
