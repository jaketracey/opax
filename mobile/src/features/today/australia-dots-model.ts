import type { Electorate } from '../../api/catalogs';
import outline from './australia-outline.json';

/** West to east, with the ACT sharing New South Wales' light. */
export const dotStates = [
  'wa',
  'nt',
  'sa',
  'qld',
  'nsw',
  'vic',
  'tas',
] as const;
export type DotState = (typeof dotStates)[number];
export const dotWidth = 192;
export const dotHeight = (outline.height / outline.width) * dotWidth;
/** Android's opaque app bar leaves the art beside the date in content. */
export const androidDotScale = 0.75;
export const dotFadeDistance = 90;
export const dotCrossfadeSeconds = 0.9;

/**
 * How the dots arrive (sweep 1 item 11): the first draw in a session fades
 * in over `motion.duration.crossfade` with no movement; a later mount (a
 * return visit, a refresh) shows them at once, as does Reduce Motion. While
 * the Reduce Motion setting is still unknown the art waits, hidden.
 */
export type DotArrival = 'fade' | 'shown' | 'wait';
export function dotArrival(
  arrivedThisSession: boolean,
  reduceMotion: boolean | null,
): DotArrival {
  if (arrivedThisSession || reduceMotion === true) return 'shown';
  return reduceMotion === null ? 'wait' : 'fade';
}

export function electorateDotState(
  seat: Pick<Electorate, 'state_code'> | null,
): DotState | null {
  const code = seat?.state_code.toLowerCase();
  if (code === 'act') return 'nsw';
  return dotStates.find((state) => state === code) ?? null;
}

/** ABS state codes, in the same groups as the electorate directory. */
export function outlineDotState(code: string): DotState | null {
  const states: Record<string, DotState> = {
    '1': 'nsw',
    '2': 'vic',
    '3': 'qld',
    '4': 'sa',
    '5': 'wa',
    '6': 'tas',
    '7': 'nt',
    '8': 'nsw',
  };
  return states[code] ?? null;
}

function clamp(value: number) {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

function smooth(value: number) {
  'worklet';
  const x = clamp(value);
  return x * x * (3 - 2 * x);
}

export function cycleLevel(group: number, seconds: number): number {
  'worklet';
  const count = dotStates.length;
  const position = (seconds / 2.4) % count;
  const d = (position - group + count) % count;
  return d < 1.35 ? smooth(d / 0.35) * (1 - smooth((d - 1) / 0.35)) : 0;
}

/** No seat: the highlight walks the states, west to east. */
export const DOT_CYCLE = -1;
/**
 * The seat is not known yet (sweep 3, item 1): every state at the navy base,
 * no bronze and no clock, so the map can draw from Today's first frame and
 * the seat's tint (or the walk) fades in once the seat read answers.
 */
export const DOT_NEUTRAL = -2;

/** The highlight's target for a seat's state, its absence, or not knowing. */
export function dotTarget(state: DotState | null, neutral = false): number {
  if (neutral) return DOT_NEUTRAL;
  return state ? dotStates.indexOf(state) : DOT_CYCLE;
}

export interface DotHighlight {
  /** DOT_CYCLE walks, DOT_NEUTRAL holds none; otherwise an index into dotStates. */
  target: number;
  /** A snapshot allows an interrupted crossfade to continue without a jump. */
  from: number[];
  changedAt: number;
}

/** The approved mock's level(), also used by the UI worklets. */
export function dotLevel(
  group: number,
  seconds: number,
  highlight: DotHighlight,
  reduced: boolean,
): number {
  'worklet';
  const held = group === highlight.target ? 1 : 0;
  if (reduced) return held;
  const target =
    highlight.target === DOT_CYCLE ? cycleLevel(group, seconds) : held;
  if (highlight.changedAt < 0) return target;
  const k = smooth((seconds - highlight.changedAt) / dotCrossfadeSeconds);
  return (highlight.from[group] ?? 0) * (1 - k) + target * k;
}

export function dotRowOpacity(yFraction: number, scroll: number): number {
  'worklet';
  const wipe = clamp(scroll / dotFadeDistance);
  return clamp((1 - wipe) * 1.6 - yFraction * 0.6);
}

/** iOS offsets start at minus the expanded bar's automatic top inset. */
export function dotScrollDistance(offset: number, topInset: number): number {
  'worklet';
  return Number.isFinite(offset) ? Math.max(0, offset + topInset) : 0;
}

/**
 * The header's expanded height as far as Today can tell now, in points.
 *
 * `reported` is the largest height NativeStack has delivered. On a cold
 * launch that is an inline estimate until the large title's height arrives,
 * 100 ms or more later (it is debounced, and a first launch's JS is busy).
 * Until it is `known`, the scroll view's own rest offset says it sooner:
 * UIKit reports minus the automatic inset as soon as it applies it, on the
 * UI thread. Once known, the reported height alone counts, so a pull down
 * (an offset past rest) never reads as a taller header.
 */
export function expandedHeaderNow(
  known: boolean,
  offset: number,
  reported: number,
): number {
  'worklet';
  return known || !Number.isFinite(offset)
    ? reported
    : Math.max(reported, -offset);
}

export function dotClockNeeded(
  visible: boolean,
  focused: boolean,
  foreground: boolean,
  reduced: boolean,
  seconds: number,
  highlight: DotHighlight,
): boolean {
  'worklet';
  return (
    visible &&
    focused &&
    foreground &&
    !reduced &&
    (highlight.target === DOT_CYCLE ||
      (highlight.changedAt >= 0 &&
        seconds - highlight.changedAt < dotCrossfadeSeconds))
  );
}

export interface DotRow {
  y: number;
  groups: { state: DotState; points: { x: number; y: number }[] }[];
}

/** Sample once in source coordinates, output points at the final 5 pt grid. */
export function sampleDotRows(
  width: number,
  height: number,
  paths: {
    state: DotState;
    contains: (x: number, y: number) => boolean;
  }[],
): DotRow[] {
  const scale = dotWidth / width;
  const step = 5 / scale;
  const rows: DotRow[] = [];
  for (let y = step / 2; y < height; y += step) {
    const groups = new Map<DotState, { x: number; y: number }[]>();
    for (let x = step / 2; x < width; x += step) {
      const path = paths.find((path) => path.contains(x, y));
      if (!path) continue;
      const points = groups.get(path.state) ?? [];
      points.push({ x: x * scale, y: y * scale });
      groups.set(path.state, points);
    }
    if (groups.size)
      rows.push({
        y: y * scale,
        groups: [...groups].map(([state, points]) => ({ state, points })),
      });
  }
  return rows;
}
