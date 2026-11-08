import { useCallback, useEffect, useRef, useState } from 'react';
import { TwoSlotStore } from '../../storage/two-slot';

/**
 * Captions are on by default (specs/account.md 7.4, F-2), so answers can be
 * read and checked; a choice to hide them is remembered on this device.
 * Only the switch is stored: never a caption or a transcript.
 */
const store = new TwoSlotStore<{ on: boolean }>(
  ['opax-talk-captions-v1.json', 'opax-talk-captions-v1.b.json'],
  (raw) => {
    const on = (raw as { on?: unknown } | null)?.on;
    return typeof on === 'boolean' ? { on } : null;
  },
  (value) => value,
);

export function useCaptionsPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  const chosen = useRef(false);
  useEffect(() => {
    let current = true;
    void store
      .read()
      .then((value) => {
        // A choice made while the file was read wins over the stored one.
        if (current && value && !chosen.current) setOn(value.on);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  const change = useCallback((next: boolean) => {
    chosen.current = true;
    setOn(next);
    // A failed save only forgets the choice; the switch still works.
    void store.save({ on: next }).catch(() => undefined);
  }, []);
  return [on, change];
}
