import { Platform } from 'react-native';
import { haptic } from '../design/haptics';

/**
 * The detent each open sheet last settled on, by route key. It lives outside
 * every component, so a screen that remounts (a theme change, a fold) keeps
 * what was already felt and does not replay the tap.
 */
const settled = new Map<string, number>();
const REMEMBERED = 24;

/**
 * One selection tap when a sheet settles on another detent: half to full
 * height or back. UIKit reports only a change the reader made, so the first
 * report on iOS is already a snap. Android also reports the sheet settling as
 * it opens; that first report is where the sheet started, not a snap.
 * Dragging (`stable: false`) and closing (a negative index) are silent.
 */
export function feelSheetSnap(
  routeKey: string,
  { index, stable }: { index: number; stable: boolean },
) {
  if (!stable || !Number.isInteger(index) || index < 0) return;
  const last = settled.get(routeKey);
  if (last === index) return;
  // Re-insert so the map keeps the most recently moved sheets.
  settled.delete(routeKey);
  settled.set(routeKey, index);
  if (settled.size > REMEMBERED)
    settled.delete(settled.keys().next().value as string);
  if (last === undefined && Platform.OS === 'android') return;
  haptic('selection');
}

/** Stack.Screen `listeners` for any route that may be shown as a sheet. */
export function sheetSnapListeners({ route }: { route: { key: string } }) {
  return {
    sheetDetentChange: (event: { data: { index: number; stable: boolean } }) =>
      feelSheetSnap(route.key, event.data),
  };
}

/** Tests start with no sheet remembered. */
export function forgetSheetSnaps() {
  settled.clear();
}
