import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

/**
 * The offset that keeps the growing end of a streamed answer `gap` above the
 * composer, or null when it is already in view. Only ever further down: the
 * question and the answer's first line stay under the bar until the answer
 * outgrows the room, and then leave it line by line.
 */
export function followOffset({
  tailBottom,
  viewport,
  obscured,
  offset,
  gap,
}: {
  /** The live turn's bottom edge, in content coordinates. */
  tailBottom: number;
  /** The scroll view's height. */
  viewport: number;
  /** How much of its bottom the composer (and keyboard) cover. */
  obscured: number;
  /** The current content offset. */
  offset: number;
  gap: number;
}): number | null {
  const target = tailBottom + gap - (viewport - obscured);
  return target > offset + 1 ? target : null;
}

/**
 * Stick-to-bottom while an answer streams. It follows only until the reader
 * drags: from then on this answer stays where they put it. Nothing moves
 * when the answer lands, because nothing here runs after the stream.
 */
export function useStreamFollow(
  scroll: RefObject<ScrollView | null>,
  {
    streaming,
    obscured,
    gap,
    animated,
    rest,
  }: {
    /** An answer is being written. */
    streaming: boolean;
    obscured: number;
    gap: number;
    /** False under Reduce Motion: the thread jumps. */
    animated: boolean;
    /** The offset at rest, before any scroll event has reported one. */
    rest: number;
  },
) {
  const following = useRef(true);
  const viewport = useRef(0);
  const turn = useRef(0);
  const bottom = useRef<number | null>(null);
  const offset = useRef<number | null>(null);
  const now = useRef({ streaming, obscured, gap, animated, rest });
  useEffect(() => {
    now.current = { streaming, obscured, gap, animated, rest };
  });
  // Each answer starts out following, whatever the last one ended as.
  useEffect(() => {
    if (!streaming) return;
    following.current = true;
    bottom.current = null;
  }, [streaming]);
  const follow = useCallback(() => {
    const at = now.current;
    if (!at.streaming || !following.current) return;
    if (!viewport.current || bottom.current === null) return;
    const y = followOffset({
      tailBottom: turn.current + bottom.current,
      viewport: viewport.current,
      obscured: at.obscured,
      offset: offset.current ?? at.rest,
      gap: at.gap,
    });
    if (y === null) return;
    // Counted at once, so the next piece measures from where this one goes.
    offset.current = y;
    scroll.current?.scrollTo({ y, animated: at.animated });
  }, [scroll]);
  // The composer growing or the keyboard rising covers more of the answer.
  useEffect(follow, [follow, obscured]);
  return {
    onViewport(height: number) {
      viewport.current = height;
      follow();
    },
    onTurn(y: number) {
      turn.current = y;
      follow();
    },
    /** The live progress block's bottom edge within its turn. */
    onProgress(edge: number) {
      bottom.current = edge;
      follow();
    },
    onScroll(y: number) {
      offset.current = y;
    },
    /** The reader took over: this answer is theirs to place. */
    onDrag() {
      following.current = false;
    },
  };
}
