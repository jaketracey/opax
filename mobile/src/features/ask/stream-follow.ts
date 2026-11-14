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

/** A reported offset this far above the last one was not the follow's. */
const FALL = 4;

/**
 * Stick-to-bottom while an answer streams.
 *
 * It follows until someone else moves the thread up: a drag, or any scroll
 * that reports a lower offset than the last (a VoiceOver or TalkBack scroll,
 * focus moving to an earlier element, a status-bar or tab tap). The follow's
 * own scrolls only ever go down, so a fall is never its own. It follows
 * again once the reader is back within `near` of the growing end.
 *
 * Layout reports from one commit (the composer, the scroll view, the turn)
 * arrive in any order, so each frame follows once, from all of them.
 * Nothing moves when the answer lands, because nothing here runs after the
 * stream.
 */
export function useStreamFollow(
  scroll: RefObject<ScrollView | null>,
  {
    streaming,
    started,
    obscured,
    gap,
    near,
    animated,
    rest,
  }: {
    /** An answer is being written. */
    streaming: boolean;
    /** Its text has begun: before that the screen's own reveal may scroll. */
    started: boolean;
    obscured: number;
    gap: number;
    /** How close to the growing end counts as back at it. */
    near: number;
    /** False under Reduce Motion: the thread jumps. */
    animated: boolean;
    /** The offset at rest, before any scroll event has reported one. */
    rest: number;
  },
) {
  const state = useRef({
    following: true,
    dragging: false,
    viewport: 0,
    /** The thread's top in the scroll content, under any title and padding. */
    thread: 0,
    /** The live turn's top in the thread. */
    turn: 0,
    /** The progress block's bottom edge in its turn. */
    bottom: null as number | null,
    reported: null as number | null,
    /** Where the last follow scroll is going, before events report it. */
    aim: null as number | null,
  });
  const frame = useRef<number | null>(null);
  const now = useRef({
    streaming,
    started,
    obscured,
    gap,
    near,
    animated,
    rest,
  });
  useEffect(() => {
    now.current = { streaming, started, obscured, gap, near, animated, rest };
  });
  // Each answer starts out following, whatever the last one ended as.
  useEffect(() => {
    if (!streaming) return;
    Object.assign(state.current, {
      following: true,
      dragging: false,
      bottom: null,
      aim: null,
    });
  }, [streaming]);
  /** The offset that puts the growing end the gap above the composer. */
  const target = useCallback(() => {
    const { viewport, thread, turn, bottom } = state.current;
    if (!viewport || bottom === null) return null;
    return {
      tailBottom: thread + turn + bottom,
      viewport,
      obscured: now.current.obscured,
      gap: now.current.gap,
    };
  }, []);
  const follow = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const at = now.current;
      const held = state.current;
      const geometry = target();
      if (!at.streaming || !held.following || !geometry) return;
      const y = followOffset({
        ...geometry,
        offset: Math.max(held.reported ?? at.rest, held.aim ?? -Infinity),
      });
      if (y === null) return;
      // Counted at once, so the next piece measures from where this one goes.
      held.aim = y;
      scroll.current?.scrollTo({ y, animated: at.animated });
    });
  }, [scroll, target]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  // The composer growing or the keyboard rising covers more of the answer.
  useEffect(follow, [follow, obscured]);
  /** Back at the growing end: follow it again. */
  const rearm = useCallback(() => {
    const held = state.current;
    const geometry = target();
    if (!now.current.streaming || held.following || held.dragging) return;
    if (!geometry) return;
    const end = followOffset({ ...geometry, offset: -Infinity })!;
    if ((held.reported ?? now.current.rest) < end - now.current.near) return;
    held.following = true;
    follow();
  }, [follow, target]);
  return {
    onViewport(height: number) {
      state.current.viewport = height;
      follow();
    },
    onThread(y: number) {
      state.current.thread = y;
      follow();
    },
    onTurn(y: number) {
      state.current.turn = y;
      follow();
    },
    /** The live progress block's bottom edge within its turn. */
    onProgress(edge: number) {
      state.current.bottom = edge;
      follow();
    },
    onScroll(y: number) {
      const held = state.current;
      const last = held.reported;
      held.reported = y;
      if (
        now.current.streaming &&
        now.current.started &&
        held.following &&
        last !== null &&
        y < last - FALL
      ) {
        // Someone else moved it up: this answer is theirs to place.
        held.following = false;
        held.aim = null;
      } else if (!held.following) rearm();
    },
    /** The reader took over. */
    onDrag() {
      Object.assign(state.current, {
        dragging: true,
        following: false,
        aim: null,
      });
    },
    onDragEnd() {
      state.current.dragging = false;
      rearm();
    },
    onMomentumEnd: rearm,
  };
}
