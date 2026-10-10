// Account session changes: a confirmed sign-in, sign-out, deletion or a 401.
// Features holding signed-in state listen here when they are in the build
// (Community clears its cache, blocks and drafts), so Account imports none of
// them and a build without Community has nothing to clear.
const listeners = new Set<() => void>();

export function onAccountSessionChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function accountSessionChanged() {
  listeners.forEach((listener) => listener());
}
