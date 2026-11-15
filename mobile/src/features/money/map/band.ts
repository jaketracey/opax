import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a smaller inset must hold before the band follows it down (ms). */
export const BAND_HOLD = 300;

/**
 * The band under the map's panel, from the system's bottom inset as a probe
 * reports it. It rises at once and falls only after the smaller value has
 * held: at the end of a push iOS reports the inset without the tab bar for
 * a few frames, and a panel that followed it dipped and came back. A real
 * decrease (a rotation, a tab bar that minimises) is followed after the
 * hold.
 */
export function useHeldInset(hold = BAND_HOLD) {
  const [inset, setInset] = useState(0);
  const shown = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const report = useCallback(
    (next: number) => {
      clear();
      if (next === shown.current) return;
      if (next > shown.current) {
        shown.current = next;
        setInset(next);
        return;
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        shown.current = next;
        setInset(next);
      }, hold);
    },
    [hold],
  );
  useEffect(() => clear, []);
  return [inset, report] as const;
}
