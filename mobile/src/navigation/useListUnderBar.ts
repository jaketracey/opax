import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSolidBar } from '../design/accessibility';
import { useHeaderBottom } from '../design/useHeaderBottom';
import { useRootBarUnderBar } from './useRootBarAppearance';

/**
 * A large-title page whose list is not a `Screen` says when it has scrolled
 * under the bar, as Screen does, so the solid bar of Reduce Transparency or
 * Increase Contrast takes its ground only then: at rest that ground covered
 * the large title.
 *
 * Pass `onScroll` the list's scroll events while `reports` is true, or
 * always if the list hears them anyway. The latest offset is kept, so when
 * a setting turns on with the page already scrolled the bar is solid at
 * once, with no scroll. If the setting turns on and the list has not been
 * heard (it was not listening), nothing is reported until it scrolls: the
 * bar keeps its solid ground throughout, as an unreporting page's does, so
 * content never runs through a clear bar. With neither setting on nothing
 * is reported, and what was reported is withdrawn.
 */
export function useListUnderBar(enabled = true) {
  const solid = useSolidBar();
  const reports = Platform.OS === 'ios' && solid && enabled;
  const headerBottom = useHeaderBottom();
  const y = useRef<number | null>(null);
  // Whether the page has been without a report: a first mount is at rest.
  const wasOff = useRef(false);
  const [known, setKnown] = useState(true);
  const [underBar, setUnderBar] = useState(false);
  const check = useCallback(() => {
    if (!reports) {
      wasOff.current = true;
      return;
    }
    if (y.current === null) {
      if (wasOff.current) setKnown(false);
      return;
    }
    setKnown(true);
    setUnderBar(y.current + headerBottom > 1);
  }, [reports, headerBottom]);
  // The setting turned on or off, or the bar's height changed.
  useLayoutEffect(check, [check]);
  useRootBarUnderBar(underBar, reports && known, true);
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      y.current = event.nativeEvent.contentOffset.y;
      check();
    },
    [check],
  );
  return { onScroll, reports };
}
