import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import { isAccessibilityCategory } from './tokens';

// One subscription per setting for the whole app, not one per Text.
function setting(
  read: () => Promise<boolean>,
  event: 'boldTextChanged' | 'reduceMotionChanged',
) {
  let value = false;
  // False until the first read or change event: the value is a guess before.
  let known = false;
  const listeners = new Set<() => void>();
  let subscribed = false;
  const notify = (next: boolean) => {
    if (known && next === value) return;
    known = true;
    value = next;
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!subscribed) {
        subscribed = true;
        read().then(notify, () => undefined);
        AccessibilityInfo.addEventListener(event, notify);
      }
      return () => listeners.delete(listener);
    },
    get: () => value,
    getKnown: () => (known ? value : null),
  };
}
const boldText = setting(
  () => AccessibilityInfo.isBoldTextEnabled(),
  'boldTextChanged',
);
const reduceMotion = setting(
  () => AccessibilityInfo.isReduceMotionEnabled(),
  'reduceMotionChanged',
);

/** iOS Bold Text: the bundled fonts step up one weight (they are not system fonts). */
export function useBoldText(): boolean {
  return useSyncExternalStore(boldText.subscribe, boldText.get, boldText.get);
}
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    reduceMotion.subscribe,
    reduceMotion.get,
    reduceMotion.get,
  );
}
/**
 * Reduce Motion, or null until iOS has answered. Use it where motion would
 * start at once on mount (a reveal), so nothing starts before the setting is
 * known.
 */
export function useReduceMotionSetting(): boolean | null {
  return useSyncExternalStore(
    reduceMotion.subscribe,
    reduceMotion.getKnown,
    reduceMotion.getKnown,
  );
}
/**
 * True at accessibility text sizes (AX1 to AX5). Side-by-side layouts stack
 * vertically there: figure and label, key and value, segments, tiles.
 */
export function useAccessibilitySize(): boolean {
  return isAccessibilityCategory(useWindowDimensions().fontScale);
}
