import { requireOptionalNativeModule } from 'expo';
import { Platform, type ColorValue } from 'react-native';
import { useSyncExternalStore } from 'react';

export type VerticalBarEdge = 'unspecified' | 'leading' | 'trailing';

interface RootBarModule {
  getVerticalBarEdge?(): VerticalBarEdge;
  addListener?(
    event: 'onVerticalBarEdge',
    listener: (event: { edge: VerticalBarEdge }) => void,
  ): { remove(): void };
  setSolid?(identifier: string, ground: ColorValue): Promise<void>;
  remove(identifier: string): Promise<void>;
}

export const RootBar =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<RootBarModule>('OpaxRootBar')
    : null;

let edge: VerticalBarEdge = 'unspecified';
const listeners = new Set<() => void>();
let subscription: { remove(): void } | undefined;
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!subscription)
    subscription = RootBar?.addListener?.('onVerticalBarEdge', (event) => {
      edge = event.edge;
      listeners.forEach((notify) => notify());
    });
  // The native snapshot is cached and never blocks the main thread.
  const current = RootBar?.getVerticalBarEdge?.() ?? 'unspecified';
  if (edge !== current) {
    edge = current;
    listeners.forEach((notify) => notify());
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      subscription?.remove();
      subscription = undefined;
    }
  };
}

/** The bar edge now, for route options that are computed outside a component. */
export function currentVerticalBarEdge(): VerticalBarEdge {
  return RootBar?.getVerticalBarEdge?.() ?? edge;
}

/** UIKit's preferred bar edge, independent of window aspect ratio or idiom. */
export function useVerticalBarEdge(): VerticalBarEdge {
  return useSyncExternalStore(
    subscribe,
    () => RootBar?.getVerticalBarEdge?.() ?? edge,
    () => 'unspecified',
  );
}
