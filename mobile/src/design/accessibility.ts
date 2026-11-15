import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { isAccessibilityCategory } from './tokens';

// One subscription per setting for the whole app, not one per Text.
function setting(
  read: () => Promise<boolean>,
  event:
    | 'boldTextChanged'
    | 'reduceMotionChanged'
    | 'reduceTransparencyChanged'
    | 'darkerSystemColorsChanged'
    | 'highTextContrastChanged'
    | 'screenReaderChanged',
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
        let changed = false;
        AccessibilityInfo.addEventListener(event, (next) => {
          changed = true;
          notify(next);
        });
        read().then(
          (next) => {
            // A native read may have started before the user changed the
            // setting. Events are newer than that initial snapshot.
            if (!changed) notify(next);
          },
          () => undefined,
        );
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
// A read the system refuses is "not running": nothing waits on it for good.
const screenReader = setting(
  () =>
    Promise.resolve(AccessibilityInfo.isScreenReaderEnabled()).then(
      (running) => !!running,
      () => false,
    ),
  'screenReaderChanged',
);
const increaseContrast = setting(
  () =>
    AccessibilityInfo.isDarkerSystemColorsEnabled?.() ?? Promise.resolve(false),
  'darkerSystemColorsChanged',
);
const reduceTransparency = setting(
  () =>
    Platform.OS === 'ios'
      ? AccessibilityInfo.isReduceTransparencyEnabled()
      : Promise.resolve(false),
  'reduceTransparencyChanged',
);
// Android's "High contrast text". iOS never reports it (Increase Contrast
// resolves there natively through DynamicColorIOS).
const highTextContrast = setting(
  () =>
    Platform.OS === 'android'
      ? (AccessibilityInfo.isHighTextContrastEnabled?.() ??
        Promise.resolve(false))
      : Promise.resolve(false),
  'highTextContrastChanged',
);

/** iOS Bold Text: the bundled fonts step up one weight (they are not system fonts). */
export function useBoldText(): boolean {
  return useSyncExternalStore(boldText.subscribe, boldText.get, boldText.get);
}
/**
 * iOS Increase Contrast. Role colours resolve it natively (`colors` in
 * tokens.ts); computed hexes (Today's tints) read it here and strengthen.
 */
export function useIncreaseContrast(): boolean {
  return useSyncExternalStore(
    increaseContrast.subscribe,
    increaseContrast.get,
    increaseContrast.get,
  );
}
export function useReduceTransparency(): boolean {
  return useSyncExternalStore(
    reduceTransparency.subscribe,
    reduceTransparency.get,
    reduceTransparency.get,
  );
}

/** Either iOS legibility setting requests a solid navigation background. */
export function useSolidBar(): boolean {
  const reduced = useReduceTransparency();
  const contrast = useIncreaseContrast();
  return Platform.OS === 'ios' && (reduced || contrast);
}
/**
 * Android's High contrast text. Android colours are plain hex values (no
 * DynamicColorIOS), so `Text` swaps each role for its Increase Contrast value
 * while this is on: the same stronger roles iOS draws. Always false on iOS.
 */
export function useHighTextContrast(): boolean {
  return useSyncExternalStore(
    highTextContrast.subscribe,
    highTextContrast.get,
    highTextContrast.get,
  );
}
export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    reduceMotion.subscribe,
    reduceMotion.get,
    reduceMotion.get,
  );
}
/**
 * Whether a programmatic scroll or zoom may animate, for code outside render
 * (a callback, a measure response): false with Reduce Motion on, so the view
 * lands at its target in one step. The first call starts the app's one
 * subscription if no component has; until the system answers it animates.
 */
export function animatedScroll(): boolean {
  if (!scrollWatch) scrollWatch = reduceMotion.subscribe(() => undefined);
  return !reduceMotion.get();
}
let scrollWatch: (() => void) | undefined;
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
 * Whether a screen reader (VoiceOver, TalkBack) is running; null until the
 * system has answered.
 */
export function useScreenReaderSetting(): boolean | null {
  return useSyncExternalStore(
    screenReader.subscribe,
    screenReader.getKnown,
    screenReader.getKnown,
  );
}
/**
 * Whether a native search field draws its shorter placeholder: at
 * accessibility text sizes, where the full one is cut off, and only once
 * it is known that no screen reader is running. The system field has no
 * label of its own, so VoiceOver and TalkBack read the placeholder: with
 * one running (or not yet known) the field keeps its full words, which are
 * read whole even when drawn cut off. The short form is for the eye only.
 */
export function useShortPlaceholder(): boolean {
  const large = useAccessibilitySize();
  const reader = useScreenReaderSetting();
  return large && reader === false;
}
/**
 * True at accessibility text sizes (AX1 to AX5). Side-by-side layouts stack
 * vertically there: figure and label, key and value, segments, tiles.
 */
export function useAccessibilitySize(): boolean {
  return isAccessibilityCategory(useWindowDimensions().fontScale);
}
