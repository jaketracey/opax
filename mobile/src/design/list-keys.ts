import { useCallback, useContext, useState, useSyncExternalStore } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { useKeyCommand } from './keyboard';

/** Arrows only move a cursor; opening a record always takes Return. */
export function useListKeys(
  keys: readonly string[],
  onOpen: (key: string) => void,
  reveal: (key: string) => void,
  enabled = true,
) {
  const navigation = useContext(NavigationContext);
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!navigation) return () => {};
      const focus = navigation.addListener('focus', listener);
      const blur = navigation.addListener('blur', listener);
      return () => {
        focus();
        blur();
      };
    },
    [navigation],
  );
  const focused = useSyncExternalStore(
    subscribe,
    () => navigation?.isFocused() ?? true,
  );
  const [held, setHeld] = useState<string | null>(null);
  const cursor = held && keys.includes(held) ? held : null;
  const move = (by: number) => {
    if (!keys.length) return;
    const index = cursor ? keys.indexOf(cursor) : -1;
    const next =
      keys[
        index < 0
          ? by > 0
            ? 0
            : keys.length - 1
          : Math.min(Math.max(index + by, 0), keys.length - 1)
      ]!;
    setHeld(next);
    reveal(next);
  };
  useKeyCommand('list-down', () => move(1), enabled && focused);
  useKeyCommand('list-up', () => move(-1), enabled && focused);
  useKeyCommand(
    'list-open',
    () => {
      const key = cursor ?? keys[0];
      if (key) onOpen(key);
    },
    enabled && focused,
  );
  return cursor;
}
