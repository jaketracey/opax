import { router, useNavigationContainerRef, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  linkDeliveryParam,
  linkDeliveryPath,
  setLinkNavigationReady,
  subscribeAndroidLinks,
} from './link-readiness';
import { resolveSystemPath } from './system-path';

type RouteState = {
  index?: number;
  routes: readonly {
    params?: object;
    state?: RouteState;
  }[];
};

/** Only the selected leaf can acknowledge a navigation delivery. */
function selectedDelivery(state: RouteState | undefined): unknown {
  const route = state?.routes[state.index ?? 0];
  if (route?.state) return selectedDelivery(route.state);
  return (route?.params as Record<string, unknown> | undefined)?.[
    linkDeliveryParam
  ];
}

/** The root must render its navigator, then the container must report ready. */
export function useLinkReadiness(rootRendered: boolean) {
  const navigation = useNavigationContainerRef();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelDelivery: (() => void) | undefined;
    const unsubscribe = subscribeAndroidLinks((delivery) => {
      const arrived = () =>
        navigation.isReady() &&
        selectedDelivery(navigation.getRootState()) === delivery.id;
      // The cold path already selected this delivery before mounting the root.
      if (arrived()) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (delivered: boolean) => {
          if (settled) return;
          settled = true;
          removeState();
          cancelDelivery = undefined;
          resolve(delivered);
        };
        const removeState = navigation.addListener('state', () => {
          if (arrived()) finish(true);
        });
        cancelDelivery = () => finish(false);
        try {
          const destination = resolveSystemPath({
            path: delivery.url,
            initial: false,
          });
          router.navigate(linkDeliveryPath(destination, delivery.id) as Href);
          if (arrived()) finish(true);
        } catch {
          finish(false);
        }
      });
    });
    const update = () => {
      const next = rootRendered && navigation.isReady();
      setLinkNavigationReady(next);
      setReady(next);
    };
    const removeReady = navigation.addListener('ready', update);
    const removeState = navigation.addListener('state', update);
    update();
    return () => {
      removeReady();
      removeState();
      setLinkNavigationReady(false);
      unsubscribe();
      cancelDelivery?.();
    };
  }, [navigation, rootRendered]);
  return ready;
}
