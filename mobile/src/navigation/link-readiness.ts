// Native URL events can arrive while the root is still loading its fonts.
// Keep Expo Router's own listener waiting, rather than dispatching into an
// absent navigator or replaying the event through a second URL subscription.
let ready = false;
const waiting = new Set<() => void>();

export function waitForLinkNavigation(): Promise<void> | null {
  return ready ? null : new Promise((resolve) => waiting.add(resolve));
}

export function setLinkNavigationReady(value: boolean) {
  ready = value;
  if (!ready) return;
  const pending = [...waiting];
  waiting.clear();
  pending.forEach((resolve) => resolve());
}
