import { NavigationContext } from 'expo-router/react-navigation';
import {
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

/**
 * Whether a route is showing a whole-page unavailable state (not found, a
 * failed load, offline). Beside a vertical bar a page's bar holds stand-in
 * Share and More buttons until its own items arrive; a page that will never
 * have any must not keep them, dimmed, on the rail. The state component
 * says so here and RouteOptions clears the stand-ins.
 */
const pages = new WeakMap<
  object,
  { count: number; listeners: Set<() => void> }
>();

function entry(navigation: object) {
  let page = pages.get(navigation);
  if (!page) {
    page = { count: 0, listeners: new Set() };
    pages.set(navigation, page);
  }
  return page;
}

/** Mark this route unavailable while the caller is mounted and `on`. */
export function useMarkPageUnavailable(on: boolean) {
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation || !on) return;
    const page = entry(navigation);
    page.count += 1;
    page.listeners.forEach((listener) => listener());
    return () => {
      page.count -= 1;
      page.listeners.forEach((listener) => listener());
    };
  }, [navigation, on]);
}

export function usePageUnavailable(): boolean {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const page = entry(navigation);
      page.listeners.add(listener);
      return () => {
        page.listeners.delete(listener);
      };
    },
    [navigation],
  );
  return useSyncExternalStore(
    subscribe,
    () => (navigation ? entry(navigation).count > 0 : false),
    () => false,
  );
}
