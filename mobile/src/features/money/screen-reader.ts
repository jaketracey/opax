import { useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * What is known of VoiceOver: on, off, not yet answered (null), or
 * 'unanswered' once the system has had its chance and said nothing.
 */
export type ScreenReaderState = boolean | 'unanswered' | null;

/** How long the system has to answer before the List view is drawn. */
export const SCREEN_READER_WAIT = 400;

/**
 * VoiceOver, asked once as the app starts (app/_layout.tsx) and shared by
 * every money screen, so a map's first paint already knows which view to
 * draw (map 3.11). React Native has no synchronous read, so a screen that
 * mounts before the answer draws neither view until it is in.
 */
const reader = (() => {
  let known: ScreenReaderState = null;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const set = (value: ScreenReaderState) => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (known === value) return;
    known = value;
    listeners.forEach((listener) => listener());
  };
  let primed = false;
  let subscription: { remove: () => void } | null = null;
  const giveUp = () => {
    if (known === null) set('unanswered');
  };
  const prime = () => {
    if (primed) return;
    primed = true;
    try {
      subscription = AccessibilityInfo.addEventListener(
        'screenReaderChanged',
        set,
      );
      void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
        if (known === null || known === 'unanswered') set(value);
      }, giveUp);
      // An answer that never comes must not leave the page blank.
      timer = setTimeout(giveUp, SCREEN_READER_WAIT);
    } catch {
      // No accessibility bridge (a test or a headless run).
      giveUp();
    }
  };
  return {
    prime,
    forget: () => {
      subscription?.remove();
      subscription = null;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      primed = false;
      known = null;
    },
    get: () => known,
    subscribe: (listener: () => void) => {
      prime();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
})();

/** Ask the system now, so the answer is in before a money screen mounts. */
export function primeScreenReader() {
  reader.prime();
}
/** Tests start each case with VoiceOver not yet known. */
export function forgetScreenReader() {
  reader.forget();
}
/** VoiceOver's state; null until known. */
export function useMoneyScreenReader() {
  return useSyncExternalStore(reader.subscribe, reader.get, reader.get);
}
/** The first known value, kept: the view never flips once it is known. */
export function useFirstScreenReader() {
  const value = useMoneyScreenReader();
  const [first, setFirst] = useState(value);
  // Unknown at first paint: take the first known value, then hold it.
  if (first === null && value !== null) setFirst(value);
  return first === null ? value : first;
}

export type MoneyMode = 'list' | 'map';

/**
 * Which view the money map opens on: the reader's choice, else the link's
 * view, else List with VoiceOver on (or unanswered) and Map with it off.
 * Null while VoiceOver is not yet known: neither view is drawn, so one is
 * never drawn and then swapped for the other.
 */
export function moneyMode(
  chosen: MoneyMode | null,
  linked: string | undefined,
  screenReader: ScreenReaderState,
): MoneyMode | null {
  if (chosen) return chosen;
  if (linked === 'list' || linked === 'map') return linked;
  if (screenReader === null) return null;
  return screenReader === false ? 'map' : 'list';
}
