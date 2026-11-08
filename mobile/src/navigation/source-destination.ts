import { createElement, useSyncExternalStore } from 'react';
import { Text } from 'react-native';
import { isProduction } from '../design/environment';
// Local destination preview for e2e builds; the caller validates the URL and
// production continues to use the in-app browser.
export interface SourceDestinationRecord {
  url: string;
  citation: string;
}
let destination: SourceDestinationRecord | null = null;
const listeners = new Set<() => void>();
export function sourceDestination() {
  return destination;
}
export function subscribeSourceDestination(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function presentSourceDestination(
  record: SourceDestinationRecord | null,
) {
  destination = record;
  for (const listener of listeners) listener();
}

let lastExternalURL = '';
const externalListeners = new Set<() => void>();
export function recordExternalURL(url: string) {
  if (isProduction) return;
  lastExternalURL = url;
  externalListeners.forEach((listener) => listener());
}
export const lastExternalURLSnapshot = () => lastExternalURL;
const subscribeExternalURL = (listener: () => void) => {
  externalListeners.add(listener);
  return () => {
    externalListeners.delete(listener);
  };
};
/** Hidden destination evidence is available only in debug and e2e builds. */
export function ExternalURLProbe() {
  const url = useSyncExternalStore(
    subscribeExternalURL,
    lastExternalURLSnapshot,
    lastExternalURLSnapshot,
  );
  return isProduction
    ? null
    : createElement(
        Text,
        {
          testID: 'debug-last-external-url',
          accessible: false,
          accessibilityElementsHidden: true,
          importantForAccessibility: 'no-hide-descendants',
          pointerEvents: 'none',
          style: { position: 'absolute', width: 1, height: 1, opacity: 0 },
        },
        url,
      );
}
