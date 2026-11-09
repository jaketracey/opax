import { NavigationContext } from 'expo-router/react-navigation';
import { type NativeStackNavigationOptions } from 'expo-router';
import { type ReactNode } from 'react';

/** Observe the real guarded setter, with the same option merging as a stack. */
export function withNavigationOptions(
  children: ReactNode,
  observe: (options: Record<string, unknown>) => void,
) {
  let current: Record<string, unknown> = {};
  const navigation = {
    setOptions: (options: NativeStackNavigationOptions) => {
      current = { ...current, ...options };
      observe(current);
    },
    getState: () => ({
      index: 1,
      routes: [
        { key: 'root', name: 'index' },
        { key: 'current', name: 'destination' },
      ],
    }),
    isFocused: () => true,
    addListener: () => () => {},
    removeListener: () => {},
  };
  return (
    <NavigationContext.Provider value={navigation as never}>
      {children}
    </NavigationContext.Provider>
  );
}
