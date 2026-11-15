import { NavigationRouteContext } from 'expo-router/react-navigation';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';
import type { View } from 'react-native';
import { layoutProbeEnabled } from './layout-probe-flag';

/**
 * A measuring build only. On the closed iPhone Duo every pushed page was
 * reported to start higher and drop about 58 pt a moment later; the
 * simulator does not show it. With `EXPO_PUBLIC_OPAX_LAYOUT_PROBE=1` set at
 * build time, each Screen records where its content sits in the window on
 * its first layout, 250 ms later and 1 s later, with the header height and
 * the scroll offset at each. The numbers stay in memory on the device, are
 * never sent anywhere, and are read from a row in Account. Without the flag
 * nothing is recorded and the row is absent.
 */

type Moment = 'first' | '250 ms' | '1 s';
interface Sample {
  at: Moment;
  /** The content's top in the window, in points; null if not measured. */
  top: number | null;
  header: number;
  /** The scroll offset last reported; null before any scroll event. */
  offset: number | null;
}
interface Entry {
  route: string;
  samples: Sample[];
}

const KEEP = 20;
const entries: Entry[] = [];
const listeners = new Set<() => void>();
let version = 0;

function changed() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeLayoutProbe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export const layoutProbeVersion = () => version;

const round = (value: number | null) =>
  value === null ? 'none' : String(Math.round(value * 10) / 10);

/** The last routes, oldest first, one line each. Empty when nothing is held. */
export function layoutProbeText(): string {
  return entries
    .map(
      (entry) =>
        `${entry.route}\n` +
        entry.samples
          .map(
            (s) =>
              `  ${s.at}: top ${round(s.top)}, header ${round(s.header)}, offset ${round(s.offset)}`,
          )
          .join('\n'),
    )
    .join('\n');
}

/** For tests. */
export function resetLayoutProbe() {
  entries.length = 0;
  changed();
}

/**
 * The recorder, used only in a build with the flag. `content` is the page's
 * content view, `offset` the scroll offset Screen already tracks, `header`
 * where the bar ends.
 */
function useRecorder(
  content: RefObject<View | null>,
  offset: RefObject<number | null>,
  header: number,
) {
  const route = useContext(NavigationRouteContext)?.name ?? '(no route)';
  const latestHeader = useRef(header);
  useEffect(() => {
    latestHeader.current = header;
  }, [header]);
  useLayoutEffect(() => {
    const entry: Entry = { route, samples: [] };
    entries.push(entry);
    if (entries.length > KEEP) entries.shift();
    const sample = (at: Moment) => {
      const taken: Sample = {
        at,
        top: null,
        header: latestHeader.current,
        offset: offset.current,
      };
      entry.samples.push(taken);
      // Fabric answers at once; an old bridge answers a little later, and a
      // view that cannot be measured leaves the top as "none".
      content.current?.measureInWindow?.((_x, y) => {
        taken.top = Number.isFinite(y) ? y : null;
        changed();
      });
      changed();
    };
    sample('first');
    const timers = [
      setTimeout(() => sample('250 ms'), 250),
      setTimeout(() => sample('1 s'), 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [route, content, offset]);
}

/**
 * Chosen once, when the module loads: without the build flag Screen calls a
 * function that does nothing at all, with no hooks and no subscriptions.
 */
export const useLayoutProbe: typeof useRecorder = layoutProbeEnabled
  ? useRecorder
  : () => undefined;
