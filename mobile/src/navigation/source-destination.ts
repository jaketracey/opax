// Local destination preview for e2e builds; the caller validates the URL and
// production continues to use the in-app browser.
let destination: string | null = null;
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
export function presentSourceDestination(url: string | null) {
  destination = url;
  for (const listener of listeners) listener();
}
