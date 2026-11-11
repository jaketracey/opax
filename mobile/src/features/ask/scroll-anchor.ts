import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import type { ScrollView } from 'react-native';

/** Keep the first visible turn and its offset when folding reflows earlier turns. */
export function useConversationAnchor(
  scroll: RefObject<ScrollView | null>,
  geometry: string,
  chat: string | null,
) {
  const rows = useRef(new Map<number, { y: number; latest: boolean }>());
  const latestTop = useRef(0);
  const offset = useRef(0);
  const anchor = useRef<{ index: number; delta: number } | null>(null);
  const pending = useRef(false);
  const frame = useRef<number | null>(null);
  const previous = useRef({ geometry, chat });
  const top = useCallback(
    (row: { y: number; latest: boolean }) =>
      row.y + (row.latest ? latestTop.current : 0),
    [],
  );
  const capture = useCallback(() => {
    const visible = [...rows.current.entries()]
      .filter(([, row]) => top(row) <= offset.current)
      .sort((a, b) => top(b[1]) - top(a[1]))[0];
    if (visible)
      anchor.current = {
        index: visible[0],
        delta: offset.current - top(visible[1]),
      };
  }, [top]);
  useLayoutEffect(() => {
    if (previous.current.chat !== chat) {
      rows.current.clear();
      anchor.current = null;
      offset.current = 0;
      latestTop.current = 0;
      pending.current = false;
    } else if (previous.current.geometry !== geometry) {
      pending.current = anchor.current !== null;
    }
    previous.current = { geometry, chat };
  }, [geometry, chat]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const restore = useCallback(() => {
    if (!pending.current || frame.current !== null) return;
    // Parent and child layout events may arrive in either order. Read together.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const held = anchor.current;
      const row = held && rows.current.get(held.index);
      if (!pending.current || !held || !row) return;
      pending.current = false;
      const y = Math.max(0, top(row) + held.delta);
      offset.current = y;
      scroll.current?.scrollTo({ y, animated: false });
    });
  }, [scroll, top]);
  return {
    onScroll(y: number) {
      if (pending.current) return;
      offset.current = y;
      capture();
    },
    onRowLayout(index: number, y: number, latest: boolean) {
      rows.current.set(index, { y, latest });
      if (pending.current) restore();
      else capture();
    },
    onLatestLayout(y: number) {
      latestTop.current = y;
      if (pending.current) restore();
    },
  };
}
