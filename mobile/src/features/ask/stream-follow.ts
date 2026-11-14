import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
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
/** A release slower than this (points a millisecond) has no momentum to keep. */
const STILL = 0.05;

/**
 * Stick-to-bottom while an answer streams.
 *
 * It follows until someone else moves the thread up and away: a drag, or any
 * scroll that reports a lower offset than the last and leaves the growing
 * end out of reach (a VoiceOver or TalkBack scroll, focus moving to an
 * earlier element, a status-bar or tab tap). The follow's own scrolls only
 * ever go down, so a fall is never its own. A fall that stays within `near`
 * of the end is the platform pulling the offset back into range (the
 * keyboard closing, shorter content after a rotation, a bounce) and changes
 * nothing. It follows again once the reader is back within `near` of the
 * end: on a still release, or when a flick's momentum has run out, never
 * during one.
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
    /** A flick's momentum is still carrying the thread. */
    coasting: false,
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
  // Before any frame queued in the same commit can run.
  useLayoutEffect(() => {
    now.current = { streaming, started, obscured, gap, near, animated, rest };
  });
  // Each answer starts out following, whatever the last one ended as. When
  // it lands, a frame already queued is dropped: nothing follows after.
  useLayoutEffect(() => {
    if (!streaming) {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      return;
    }
    Object.assign(state.current, {
      following: true,
      dragging: false,
      coasting: false,
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
  /** True when `y` leaves the growing end more than `near` below the view. */
  const away = useCallback(
    (y: number) => {
      const geometry = target();
      if (!geometry) return false;
      const end = followOffset({ ...geometry, offset: -Infinity })!;
      return y < end - now.current.near;
    },
    [target],
  );
  /** Back at the growing end, and at rest: follow it again. */
  const rearm = useCallback(() => {
    const held = state.current;
    if (!now.current.streaming || held.following) return;
    if (held.dragging || held.coasting || !target()) return;
    if (away(held.reported ?? now.current.rest)) return;
    held.following = true;
    follow();
  }, [away, follow, target]);
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
      // The thread is no longer where the last follow sent it.
      if (last !== null && y < last - FALL) held.aim = null;
      if (
        now.current.streaming &&
        now.current.started &&
        held.following &&
        last !== null &&
        y < last - FALL &&
        away(y)
      ) {
        // Someone else moved it up and away: this answer is theirs to place.
        held.following = false;
        held.aim = null;
      } else if (!held.following) rearm();
    },
    /** The reader took over. */
    onDrag() {
      Object.assign(state.current, {
        dragging: true,
        coasting: false,
        following: false,
        aim: null,
      });
    },
    /** The finger lifted, at `velocity` points a millisecond. */
    onDragEnd(velocity = 0) {
      const held = state.current;
      held.dragging = false;
      // A flick keeps its momentum: following now would cancel it.
      held.coasting = Math.abs(velocity) > STILL;
      rearm();
    },
    onMomentumBegin() {
      if (!state.current.following) state.current.coasting = true;
    },
    onMomentumEnd() {
      state.current.coasting = false;
      rearm();
    },
  };
}
