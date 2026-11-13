import { router, useNavigationContainerRef, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  setLinkNavigationReady,
  subscribeAndroidLinks,
} from './link-readiness';
import { resolveSystemPath } from './system-path';

/** The root must render its navigator, then the container must report ready. */
export function useLinkReadiness(rootRendered: boolean) {
  const navigation = useNavigationContainerRef();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const unsubscribe = subscribeAndroidLinks((path) => {
      const destination = resolveSystemPath({ path, initial: false });
      if (destination) router.navigate(destination as Href);
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
    };
  }, [navigation, rootRendered]);
  return ready;
}
