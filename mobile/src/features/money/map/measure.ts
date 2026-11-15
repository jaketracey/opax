import type { RefObject } from 'react';

/**
 * A mounted view's frame, read at once. In a layout effect this is the
 * frame of the commit about to be painted, so a size the layout depends on
 * can be in state before the first frame instead of arriving by onLayout a
 * frame or more later. Null where the host has no synchronous read (tests).
 */
export function frameOf(ref: RefObject<unknown>) {
  const node = ref.current as {
    getBoundingClientRect?: () => { width: number; height: number };
  } | null;
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const { width, height } = node.getBoundingClientRect();
  return Number.isFinite(width) && Number.isFinite(height)
    ? { width, height }
    : null;
}
