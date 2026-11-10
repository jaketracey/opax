import { NavigationContext } from 'expo-router/react-navigation';
import { useContext, useEffect, useLayoutEffect, useRef } from 'react';

// NativeTabs can select Search before its lazy root has mounted, or while a
// pushed route still has focus. Keep the request until the root can take it.
let pending = false;
const listeners = new Set<() => void>();

export function requestSearchTabReset() {
  pending = true;
  listeners.forEach((listener) => listener());
}

export function useSearchTabReset(reset: () => void) {
  const navigation = useContext(NavigationContext);
  const latest = useRef(reset);
  useLayoutEffect(() => {
    latest.current = reset;
  });
  useEffect(() => {
    const take = () => {
      if (!pending || (navigation && !navigation.isFocused())) return;
      pending = false;
      latest.current();
    };
    listeners.add(take);
    const removeFocus = navigation?.addListener('focus', take);
    take();
    return () => {
      listeners.delete(take);
      removeFocus?.();
    };
  }, [navigation]);
}
