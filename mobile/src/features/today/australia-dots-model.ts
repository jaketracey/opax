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

/**
 * How long after the window changes (rotation, Stage Manager, a fold, a new
 * text size) with Today on screen the bar's reports are taken as its rest
 * height there. The window's size reaches JS first; NativeStack sends the
 * header's new height about 100 ms later (its debounce), at most a few
 * hundred under load.
 */
export const RELEARN_MS = 1000;

/**
 * The large-title bar's height with Today at rest, the inset the art is
 * placed and faded from. It belongs to one window: an iPhone's portrait bar
 * is about 160 pt, its landscape bar has no large title, and iOS often leaves
 * the title collapsed when the phone turns back. So a window change starts
 * it again from the bar's next reports; otherwise it keeps the tallest
 * report, ignoring NativeStack's first inline estimate and the collapse as
 * Today scrolls. When the bar is the same height in the new window (an iPad
 * turning) nothing is reported and the inset carries over.
 *
 * react-native-screens reports a header's height only for the top screen of
 * a stack on screen. When the window changes while Today is covered (a
 * record pushed over it, another tab selected) its bar is reported only when
 * Today is shown again, seconds later, so the relearn stays open until then
 * and closes RELEARN_MS after Today's next focus (restInsetShown). A swipe
 * back reports the bar before focus; a tab switch may report it after.
 */
export interface RestInset {
  /** The window it was learnt in: width, height and text scale. */
  window: string;
  inset: number;
  /** The header last reported. */
  header: number;
  /**
   * Until then (ms) each report replaces the inset: the window just changed.
   * Infinity while Today is covered after a change, until it is shown.
   */
  relearnUntil: number;
}

export function nextRestInset(
  previous: RestInset | null,
  header: number,
  window: string,
  now: number,
  /** Whether Today is on screen, so its bar is reported now. */
  shown = true,
): RestInset {
  if (!previous) return { window, inset: header, header, relearnUntil: 0 };
  let next = previous;
  if (window !== next.window)
    next = {
      ...next,
      window,
      relearnUntil: shown ? now + RELEARN_MS : Infinity,
    };
  if (header === next.header) return next;
  return {
    ...next,
    header,
    inset: now <= next.relearnUntil ? header : Math.max(next.inset, header),
  };
}

/**
 * Today is shown again (its `focus`): a relearn held open while it was
 * covered closes RELEARN_MS from now, after the bar's reports in the new
 * window have arrived.
 */
export function restInsetShown(
  previous: RestInset | null,
  now: number,
): RestInset | null {
  if (previous?.relearnUntil !== Infinity) return previous;
  return { ...previous, relearnUntil: now + RELEARN_MS };
}

/** iOS offsets start at minus the expanded bar's automatic top inset. */
export function dotScrollDistance(offset: number, topInset: number): number {
  'worklet';
  return Number.isFinite(offset) ? Math.max(0, offset + topInset) : 0;
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
