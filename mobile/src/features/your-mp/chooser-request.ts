import { useEffect } from 'react';

// The welcome tour ends on "Choose your electorate", which opens Your MP's
// seat chooser (even when a seat is already saved, as on a replay). Your MP
// may not be mounted yet, so the request waits until it is taken.
let pending = false;
const listeners = new Set<() => void>();

export function requestSeatChooser() {
  pending = true;
  listeners.forEach((listener) => listener());
}

/** Calls `open` now if a request is waiting, and on every later request. */
export function useSeatChooserRequest(open: () => void) {
  useEffect(() => {
    const take = () => {
      if (!pending) return;
      pending = false;
      open();
    };
    take();
    listeners.add(take);
    return () => {
      listeners.delete(take);
    };
  }, [open]);
}
