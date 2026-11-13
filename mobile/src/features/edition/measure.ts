import { useEffect, useRef } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { track } from '../../analytics';

/**
 * The daily edition's `opax_edition` events (docs/ANALYTICS.md): the story
 * shown, its subject opened, and the reader reaching its end. The action
 * only: no position, title, date or subject. Every reader gets the same
 * edition in the same order, so any index would say which record was read.
 */
export function trackEdition(action: 'open' | 'story_open' | 'reached_end') {
  track('opax_edition', { action });
}

/** `open` once for each edition this screen shows. */
export function useEditionOpen(key: string | null) {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (key === null || shown.current === key) return;
    shown.current = key;
    trackEdition('open');
  }, [key]);
}

/**
 * `reached_end` once a screen has shown the end marker: the scroll offset
 * plus the viewport's height has passed the marker's top. A story short
 * enough to fit counts as soon as it is laid out. The marker is drawn only
 * under a ready edition, so loading and error states never count.
 */
export function useEditionEnd() {
  const state = useRef({ y: 0, viewport: 0, end: Infinity, sent: false });
  const check = () => {
    const at = state.current;
    if (at.sent || !at.viewport || at.end === Infinity) return;
    if (at.y + at.viewport < at.end) return;
    at.sent = true;
    trackEdition('reached_end');
  };
  return {
    onScroll: (y: number) => {
      state.current.y = y;
      check();
    },
    onLayout: (event: LayoutChangeEvent) => {
      state.current.viewport = event.nativeEvent.layout.height;
      check();
    },
    onEndLayout: (event: LayoutChangeEvent) => {
      state.current.end = event.nativeEvent.layout.y;
      check();
    },
  };
}
