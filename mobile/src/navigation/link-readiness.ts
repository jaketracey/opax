import { Linking, Platform } from 'react-native';

// Capture starts at JS entry, before Router attaches its URL listener. The
// app's root hook consumes this buffer after navigation reports readiness.
let ready = false;
let capture: ReturnType<typeof Linking.addEventListener> | null = null;
let listener: ((url: string) => void) | null = null;
let initialURL: string | null = null;
const pending: string[] = [];
let draining = false;

function drain() {
  if (draining) return;
  draining = true;
  try {
    while (ready && listener && pending.length) listener(pending.shift()!);
  } finally {
    draining = false;
  }
}

export function installAndroidLinkCapture(): () => void {
  if (Platform.OS !== 'android' || capture) return () => {};
  const subscription = Linking.addEventListener('url', ({ url }) => {
    // Some launchers also emit the cold URL as an event during startup.
    if (!ready && url === initialURL) return;
    pending.push(url);
    drain();
  });
  capture = subscription;
  return () => {
    if (capture !== subscription) return;
    subscription.remove();
    capture = null;
    listener = null;
    pending.length = 0;
    initialURL = null;
    ready = false;
  };
}

export const hasAndroidLinkCapture = () => capture !== null;

export function subscribeAndroidLinks(next: (url: string) => void) {
  listener = next;
  drain();
  return () => {
    if (listener === next) listener = null;
  };
}

/** The initial URL already opens its page; do not replay its startup event. */
export function consumeInitialAndroidLink(url: string) {
  initialURL = url;
  for (let index = pending.length - 1; index >= 0; index--) {
    if (pending[index] !== url) continue;
    pending.splice(0, index + 1);
    break;
  }
}

export function setLinkNavigationReady(value: boolean) {
  ready = value;
  if (ready) initialURL = null;
  drain();
}
