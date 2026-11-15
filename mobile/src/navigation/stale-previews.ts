import { CommonActions } from 'expo-router/react-navigation';
import { InternalLinkPreviewContext } from 'expo-router/build/link/InternalLinkPreviewContext';
import { useContext, useEffect } from 'react';
import { Platform } from 'react-native';

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

function firstStackWithPreloads(state: State | undefined): State | null {
  if (!state?.routes) return null;
  if (state.type === 'stack' && state.key && state.preloadedRoutes?.length)
    return state;
  for (const route of state.routes) {
    const found = firstStackWithPreloads(route.state as State | undefined);
    if (found) return found;
  }
  return null;
}

/**
 * Drops the routes a row's native preview (a peek) left preloaded.
 *
 * A peek preloads its destination in the tab's stack, and Expo Router
 * 57.0.24 leaves it there when the peek closes without being opened (a long
 * press that turns into a scroll does this). The next navigation to the same
 * route name then meets that unused route:
 *
 * - a link into the open app is a navigate that pops to an existing route;
 *   it matches the preload, finds no such route in the stack and adds
 *   nothing, so a bill link from the Bills tab opened no page at all
 *   (backlog D-billlink, seen on the Duo's outer display);
 * - `router.replace`, `router.dismissTo` and a `Redirect` reuse the preload
 *   with the peeked record's own params, so they open the peeked record
 *   rather than the one asked for.
 *
 * So the preloads go when the peek that made them closes (`usePeekCleanup`)
 * and again before a link into the open app is routed (`+native-intent`).
 * The stack's own routes and their keys are kept, so a list stays mounted
 * at its scroll position.
 *
 * Each reset is built from the container's state at the moment it is
 * dispatched, in one synchronous step: a dispatch updates that state at
 * once, and `router.*` calls are queued and applied later on top of it, so
 * no navigation can fall between the read and the reset and be undone.
 *
 * True when something was dropped: a caller that routes next lets that
 * state commit first.
 */
export function dropStalePreviews(): boolean {
  if (!container?.isReady()) return false;
  let dropped = false;
  // One stack at a time, each read fresh. The bound only guards a router
  // that refuses the reset.
  for (let turn = 0; turn < 16; turn++) {
    const stack = firstStackWithPreloads(container.getRootState() as State);
    if (!stack) break;
    container.dispatch({
      ...CommonActions.reset({ ...stack, preloadedRoutes: [] } as never),
      target: stack.key,
    });
    dropped = true;
  }
  return dropped;
}

/**
 * How long after an iPad peek starts to close before its preload is dropped.
 * Expo Router 57.0.24 opens a tapped peek on iPad only in its did-close
 * event, once UIKit's close animation (about a third of a second) has
 * finished, and that event reaches only Expo's own component. Dropped any
 * sooner, the tapped peek opened a page loaded afresh, with no animation.
 */
export const padPeekCloseMs = 1000;

/**
 * For a row's trigger inside a `Link` with a preview: when its peek closes,
 * or the row goes while it is open, what the peek preloaded is dropped.
 *
 * It waits for a tapped peek to open first, since that uses the preload: on
 * iPhone the tap navigates before the peek closes, so one turn is enough; on
 * iPad it navigates after the close animation (`padPeekCloseMs`). By then an
 * opened peek has taken its route, and only an unopened one is left to drop.
 */
export function usePeekCleanup() {
  const open = useContext(InternalLinkPreviewContext)?.isVisible ?? false;
  useEffect(() => {
    if (!open) return;
    // A new peek has its own preload: a drop still waiting on the last
    // peek's close would take it, and a tap would then load the page afresh.
    cancelDrop();
    return () => {
      const pad = Platform.OS === 'ios' && Platform.isPad;
      cancelDrop();
      waiting = setTimeout(
        () => {
          waiting = null;
          dropStalePreviews();
        },
        pad ? padPeekCloseMs : 0,
      );
    };
  }, [open]);
}

/**
 * The one drop waiting on a closed peek, shared by every row. The drop takes
 * every preloaded route, so whatever an earlier peek left goes with the next
 * peek's close.
 */
let waiting: ReturnType<typeof setTimeout> | null = null;
function cancelDrop() {
  if (waiting !== null) clearTimeout(waiting);
  waiting = null;
}
