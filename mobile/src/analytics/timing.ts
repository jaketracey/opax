import { useNavigationContainerRef } from 'expo-router';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import { useContext, useEffect, useRef } from 'react';
import { analyticsEnabled, track } from './index';
import type { TimedRoute } from './events';
import { analyticsNow, bundleStartedAt } from './startup';

/** At most one ready event per visit, for 10% of visits. No persisted choice. */
export const SCREEN_READY_SAMPLE_RATE = 0.1;
type Visit = { startedAt: number; sampled: boolean; reported: boolean };
type State = {
  index?: number;
  routes: readonly { key?: string; state?: State }[];
};
let navigationStart: { key: string; at: number } | null = null;
// One active visit survives a screen remount (for example an adaptive layout).
// Route keys stay in memory only and are never passed to analytics.
let activeVisit: { key: string; value: Visit } | null = null;
let appStartReported = false;

function observeNavigation(state: State | undefined) {
  if (!state) return;
  const route = state.routes[state.index ?? 0];
  if (route?.state) return observeNavigation(route.state);
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

/** JS entry to the first committed Today render, once per cold JS runtime. */
export function useTodayRendered() {
  useEffect(() => {
    if (appStartReported) return;
    appStartReported = true;
    track('opax_app_start', { duration_ms: analyticsNow() - bundleStartedAt });
  }, []);
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
  const firstRender = useRef<number | null>(analyticsNow());
  const complete = useRef<(() => void) | null>(null);
  const contentReady = useRef(ready);
  useEffect(() => {
    contentReady.current = ready;
  }, [ready]);

  useEffect(() => {
    if (!enabled || !navigation || !route || !analyticsEnabled()) return;
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
            startedAt: Math.min(firstRender.current ?? now, observed),
            sampled: Math.random() < SCREEN_READY_SAMPLE_RATE,
            reported: false,
          },
        };
        firstRender.current = null;
      }
      finish();
    };
    const unsubscribeFocus = navigation.addListener('focus', focus);
    const unsubscribeBlur = navigation.addListener('blur', () => {
      if (activeVisit?.key === route.key) activeVisit = null;
      firstRender.current = null;
      if (navigationStart?.key === route.key) navigationStart = null;
    });
    if (navigation.isFocused()) focus();
    else firstRender.current = null;
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
