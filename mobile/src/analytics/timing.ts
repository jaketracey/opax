import { useNavigationContainerRef } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { analyticsEnabled, track } from './index';
import type { TimedRoute } from './events';
import { screenName } from './events';
import { analyticsNow, bundleStartedAt } from './startup';

/** At most one ready event per visit, for 10% of visits. No persisted choice. */
export const SCREEN_READY_SAMPLE_RATE = 0.1;
type Visit = { startedAt: number; sampled: boolean; reported: boolean };
type State = {
  index?: number;
  routes: readonly { key?: string; name?: string; state?: State }[];
};
let navigationStart: { key: string; at: number } | null = null;
// One active visit survives a screen remount (for example an adaptive layout).
// Route keys stay in memory only and are never passed to analytics.
let activeVisit: { key: string; value: Visit } | null = null;
let appStartReported = false;
let firstFocusedRouteKey: string | null = null;

function observeNavigation(state: State | undefined, segments: string[] = []) {
  if (!state) return;
  const route = state.routes[state.index ?? 0];
  if (!route) return;
  const path = [...segments, ...(route.name?.split('/') ?? [])];
  if (route.state) return observeNavigation(route.state, path);
  // A tab/stack group without its child state is not a focused screen yet.
  if (
    route.key &&
    route.name &&
    !/^\(.*\)$/.test(route.name) &&
    firstFocusedRouteKey === null
  ) {
    firstFocusedRouteKey = route.key;
    if (screenName(path) !== '/') appStartReported = true;
  }
  if (route?.key && route.key !== navigationStart?.key) {
    navigationStart = { key: route.key, at: analyticsNow() };
    if (activeVisit?.key !== route.key) activeVisit = null;
  }
}

/** Root state notifications timestamp navigation without reading any params. */
export function useNavigationTiming() {
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    if (!analyticsEnabled()) return;
    if (navigation.isReady()) observeNavigation(navigation.getRootState());
    return navigation.addListener('state', (event) =>
      observeNavigation(event.data.state),
    );
  }, [navigation]);
}

/** JS entry to Today, only when Today is the launch's first focused route. */
export function useTodayRendered() {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  useEffect(() => {
    if (!navigation || !route || appStartReported) return;
    const report = () => {
      if (appStartReported || !navigation.isFocused()) return;
      // Child effects can run before the root observer on a Today launch.
      firstFocusedRouteKey ??= route.key;
      appStartReported = true;
      if (firstFocusedRouteKey === route.key)
        track('opax_app_start', {
          duration_ms: analyticsNow() - bundleStartedAt,
        });
    };
    report();
    return navigation.addListener('focus', report);
  }, [navigation, route]);
}

/**
 * First content commit in the focused route, including a terminal empty/error
 * state. A retained tab starts a new visit on focus. Refreshes, re-renders,
 * Strict Mode effect replay and offscreen data arrival cannot duplicate it.
 * Embedded detail panes are explicitly excluded by their caller.
 */
export function useScreenReady(
  pattern: TimedRoute,
  ready: boolean,
  enabled = true,
) {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  // Keep the container after consuming `at`, so later renders never reread
  // the clock just to initialise a ref (including a retained tab's revisit).
  const firstRender = useRef<{ at: number | null } | null>(null);
  if (firstRender.current === null)
    firstRender.current = { at: analyticsNow() };
  const complete = useRef<(() => void) | null>(null);
  const contentReady = useRef(ready);
  useEffect(() => {
    contentReady.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!enabled || !navigation || !route || !analyticsEnabled()) return;
    const initialRender = firstRender.current!;
    const finish = () => {
      const current = activeVisit?.key === route.key ? activeVisit.value : null;
      if (
        !current ||
        current.reported ||
        !contentReady.current ||
        !navigation.isFocused()
      )
        return;
      current.reported = true;
      if (current.sampled)
        track('opax_screen_ready', {
          route_pattern: pattern,
          duration_ms: analyticsNow() - current.startedAt,
        });
    };
    const focus = () => {
      if (activeVisit?.key !== route.key) {
        const now = analyticsNow();
        const observed =
          navigationStart?.key === route.key ? navigationStart.at : now;
        activeVisit = {
          key: route.key,
          value: {
            startedAt: Math.min(initialRender.at ?? now, observed),
            sampled: Math.random() < SCREEN_READY_SAMPLE_RATE,
            reported: false,
          },
        };
        initialRender.at = null;
      }
      finish();
    };
    const unsubscribeFocus = navigation.addListener('focus', focus);
    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (activeVisit?.key === route.key) activeVisit = null;
      initialRender.at = null;
      if (navigationStart?.key === route.key) navigationStart = null;
    });
    if (navigation.isFocused()) focus();
    else initialRender.at = null;
    // Readiness changes call the same once-only completion, without replacing
    // the focus subscription or resetting the visit's timestamp/sample.
    complete.current = finish;
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
      complete.current = null;
    };
  }, [enabled, navigation, pattern, route]);
  useEffect(() => {
    if (ready) complete.current?.();
  }, [ready]);
}
