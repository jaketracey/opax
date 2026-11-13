import { useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { setLinkNavigationReady } from './link-readiness';

/** Fonts, the app's stack and the navigation container must all be ready. */
export function useLinkReadiness(stackMounted: boolean) {
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const update = () =>
      setLinkNavigationReady(stackMounted && navigation.isReady());
    const ready = navigation.addListener('ready', update);
    const state = navigation.addListener('state', update);
    update();
    return () => {
      ready();
      state();
      setLinkNavigationReady(false);
    };
  }, [navigation, stackMounted]);
}
