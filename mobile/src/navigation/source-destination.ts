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
