import { StatusBar } from 'expo-status-bar';
import type { NativeStackNavigationOptions } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { isPad } from '../design/adaptive';
import { liquidGlass } from '../design/glass';

/**
 * Root routes the iPhone presents as a full-height page sheet. The route
 * sheets with detents (Sources, a glossary term) open at half height, where
 * the page behind stays whole, and the welcome covers the screen.
 */
export const pageSheetNames: ReadonlySet<string> = new Set([
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
  return routes.some((route) => pageSheetNames.has(route.name));
}

/**
 * Whether a sheet with these options is at full height as it opens: a page
 * sheet with no detents of its own, or a sheet whose opening detent is the
 * whole height (a detent of 1). That covers the cases a list of route names
 * misses: a route sheet at accessibility text sizes (its only or its
 * opening detent is 1), Ask's Conversations (a page sheet in a tab's stack)
 * and the tide table (one detent, 1). A sheet fitted to its content is not
 * counted: its height is not known here.
 */
export function sheetFullHeight(
  options: Pick<
    NativeStackNavigationOptions,
    'presentation' | 'sheetAllowedDetents' | 'sheetInitialDetentIndex'
  >,
): boolean {
  const detents = options.sheetAllowedDetents;
  if (Array.isArray(detents)) {
    const index =
      typeof options.sheetInitialDetentIndex === 'number'
        ? options.sheetInitialDetentIndex
        : 0;
    return detentFullHeight(options, index);
  }
  if (detents === 'fitToContents') return false;
  return (
    options.presentation === 'modal' ||
    options.presentation === 'pageSheet' ||
    options.presentation === 'formSheet'
  );
}

/** Whether the sheet's detent at `index` is the whole height. */
export function detentFullHeight(
  options: Pick<NativeStackNavigationOptions, 'sheetAllowedDetents'>,
  index: number,
): boolean {
  const detents = options.sheetAllowedDetents;
  return Array.isArray(detents) && (detents[index] ?? 0) >= 1;
}

/** Is this presentation a sheet at all (not a push, not a full-screen modal)? */
export function isSheet(
  options: Pick<
    NativeStackNavigationOptions,
    'presentation' | 'sheetAllowedDetents'
  >,
): boolean {
  return (
    options.presentation === 'modal' ||
    options.presentation === 'pageSheet' ||
    options.presentation === 'formSheet' ||
    options.sheetAllowedDetents !== undefined
  );
}

/**
 * The sheets now presented, by route key, in every stack: whether each
 * opened at full height, the detent it has since been dragged to, and
 * whether it is on its way out.
 */
interface Sheet {
  stack: string;
  full: boolean;
  dragged?: boolean;
  closing: boolean;
}
const sheets = new Map<string, Sheet>();
let onField = false;
const listeners = new Set<() => void>();

function settle() {
  const next =
    Platform.OS === 'ios' &&
    !isPad &&
    !liquidGlass(Platform) &&
    [...sheets.values()].some(
      (sheet) => !sheet.closing && (sheet.dragged ?? sheet.full),
    );
  if (next === onField) return;
  onField = next;
  listeners.forEach((listener) => listener());
}

/**
 * A stack reports its routes: each sheet's opening height is kept (a detent
 * the reader has dragged to is not replaced), and a route no longer in the
 * stack is dropped.
 */
export function noteStackSheets(
  stack: string,
  routes: readonly { key: string; full: boolean }[],
) {
  const live = new Set(routes.map((route) => route.key));
  for (const [key, sheet] of sheets)
    if (sheet.stack === stack && !live.has(key)) sheets.delete(key);
  for (const route of routes) {
    const known = sheets.get(route.key);
    if (known) known.full = route.full;
    else sheets.set(route.key, { stack, full: route.full, closing: false });
  }
  settle();
}

/** The reader dragged a sheet to another detent: full height, or not. */
export function noteSheetDetent(key: string, full: boolean) {
  const sheet = sheets.get(key);
  if (!sheet) return;
  sheet.dragged = full;
  settle();
}

/**
 * A sheet began to close, or a dismissal was cancelled. The style follows
 * the start of the transition, in step with the sheet, and does not wait
 * for the stack's state, which changes only once the sheet has gone.
 */
export function noteSheetClosing(key: string, closing: boolean) {
  const sheet = sheets.get(key);
  if (!sheet || sheet.closing === closing) return;
  sheet.closing = closing;
  settle();
}

/** A sheet has gone. */
export function forgetSheet(key: string) {
  if (sheets.delete(key)) settle();
}

/**
 * The root stack reports its routes on every focus and state change. Kept
 * for callers that know routes by name only: a page sheet by name is at
 * full height.
 */
export function noteRootRoutes(
  routes: readonly { name: string; key?: string }[],
) {
  noteStackSheets(
    'root',
    routes.map((route, index) => ({
      key: route.key ?? `${route.name}:${index}`,
      full: pageSheetNames.has(route.name),
    })),
  );
}

type SheetEvent = { data?: { closing?: boolean; index?: number } };
/**
 * A sheet screen's own listeners, in any stack: it is counted from the
 * start of its presentation, follows its detent as it is dragged, and is
 * dropped as its dismissal starts (and counted again if that is cancelled).
 * `resolve` gives the screen's options for a route.
 */
export function sheetStatusListeners(
  resolve: (route: {
    key: string;
    name: string;
    params?: object;
  }) => NativeStackNavigationOptions,
) {
  return ({
    route,
    navigation,
  }: {
    route: { key: string; name: string; params?: object };
    navigation: { getState?: () => { key?: string } | undefined };
  }) => {
    const stack = () => navigation.getState?.()?.key ?? 'stack';
    const present = () => {
      const options = resolve(route);
      if (!isSheet(options)) return;
      const known = sheets.get(route.key);
      if (known) {
        known.full = sheetFullHeight(options);
        known.closing = false;
      } else
        sheets.set(route.key, {
          stack: stack(),
          full: sheetFullHeight(options),
          closing: false,
        });
      settle();
    };
    return {
      focus: present,
      transitionStart: (event: SheetEvent) => {
        if (event.data?.closing) noteSheetClosing(route.key, true);
        else present();
      },
      gestureCancel: () => noteSheetClosing(route.key, false),
      sheetDetentChange: (event: SheetEvent) =>
        noteSheetDetent(
          route.key,
          detentFullHeight(resolve(route), event.data?.index ?? 0),
        ),
      beforeRemove: () => noteSheetClosing(route.key, true),
      transitionEnd: (event: SheetEvent) => {
        if (event.data?.closing) forgetSheet(route.key);
      },
    };
  };
}

/** Tests only. */
export function resetSheetStatusForTests() {
  sheets.clear();
  settle();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Mounted after the app's own status bar, so its light style wins while a
 * full-height sheet is open and the page's style returns as the sheet
 * leaves.
 */
export function SheetStatusBar() {
  const light = useSyncExternalStore(
    subscribe,
    () => onField,
    () => false,
  );
  return light ? <StatusBar style="light" /> : null;
}
