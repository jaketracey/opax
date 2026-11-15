import { StatusBar } from 'expo-status-bar';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { isPad } from '../design/adaptive';
import { liquidGlass } from '../design/glass';

/**
 * Root routes the iPhone presents as a full-height page sheet. The route
 * sheets with detents (Sources, a glossary term) open at half height, where
 * the page behind stays whole, and the welcome covers the screen.
 */
const pageSheets: ReadonlySet<string> = new Set([
  'seat',
  'talk',
  'account',
  'licences',
  'source-destination',
]);

/**
 * True while the status bar sits on the navy field. Before iOS 26 UIKit
 * shrinks the page behind a full-height sheet and shows the window above it,
 * which OPAX paints navy (the launch field), so the page's dark clock and
 * battery were dark on navy for as long as Account, Talk or the electorate
 * chooser stayed open (iPhone 16 Pro, iOS 18.4 and 18.6). iOS 26 dims the
 * page in place, and an iPad centres the sheet over it: both keep the dark
 * status bar. A route sheet opened above one of these does not change what
 * the status bar sits on, so every route in the stack counts, not only the
 * top one.
 */
export function statusBarOnField(
  routes: readonly { name: string }[],
  platform: { OS: string; Version?: string | number } = Platform,
  pad: boolean = isPad,
): boolean {
  if (platform.OS !== 'ios' || pad || liquidGlass(platform)) return false;
  return routes.some((route) => pageSheets.has(route.name));
}

let onField = false;
const listeners = new Set<() => void>();

/** The root stack reports its routes on every focus and state change. */
export function noteRootRoutes(routes: readonly { name: string }[]) {
  const next = statusBarOnField(routes);
  if (next === onField) return;
  onField = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mounted after the app's own status bar, so its light style wins while a
 * page sheet is open and the page's style returns when the sheet closes.
 */
export function SheetStatusBar() {
  const light = useSyncExternalStore(
    subscribe,
    () => onField,
    () => false,
  );
  return light ? <StatusBar style="light" /> : null;
}
