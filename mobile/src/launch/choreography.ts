import { splashCopy } from './copy';
import { splashGeometry as geometry } from './geometry.generated';
import { splash } from './timing';
import {
  emptyReservedRegions,
  placeClear,
  sidesOf,
  type Rect,
  type ReservedRegions,
} from '../design/fold';

/**
 * Where everything on the animated splash starts and settles, as plain
 * numbers from the window size and the text size, so the component's
 * worklets only interpolate and tests can read the same positions.
 *
 * The start uses the native splash's 200 x 120 artwork, the star on its
 * 60pt square and the "OPAX" wordmark at 30pt, centred on the whole window
 * on every device, as the native storyboard centres it, so the handoff from
 * the native splash has no seam. Each letter's pen comes from
 * geometry.generated.ts, where CoreText put it, so four live glyphs drawn at
 * those pens are the wordmark image.
 *
 * The end is the full name, one word a line, left-aligned as a block
 * centred in the safe content area, with the star settled above it. On
 * adaptive displays that area clears the safe area and local reserved
 * regions, so the unfold carries the lockup from the window's centre to the
 * content's (navigation/DUO.md, "Launch screen"). The letter of OPAX in each
 * word (the X of eXchange is its second glyph) is the travelling glyph; the
 * rest of the word fades in beside it.
 */
export interface Frame {
  width: number;
  height: number;
  fontScale: number;
  /** Supplied for adaptive displays; legacy phone artwork stays unchanged. */
  safeArea?: { top: number; bottom: number; left: number; right: number };
  regions?: ReservedRegions;
}
export interface Point {
  x: number;
  y: number;
}
export interface Square {
  x: number;
  y: number;
  size: number;
}
export interface Letter {
  text: string;
  /** Pen origin on the baseline, in the cover's coordinates. */
  from: Point;
  to: Point;
}
export interface Line {
  text: string;
  baseline: number;
  letter: Letter;
  /** Glyphs before the travelling letter ("e" of eXchange), or null. */
  before: { text: string; x: number } | null;
  /** The rest of the word after the travelling letter. */
  rest: { text: string; x: number };
}
export interface SplashLayout {
  /** Crossfade when a straight unfold would pass through a reserved region. */
  travelClear: boolean;
  /** The name's font size. */
  size: number;
  lineHeight: number;
  /** A glyph's Text box at `size`: its height and the baseline's offset in it. */
  glyph: { height: number; ascent: number };
  /** Top-left of the 200 x 120 lockup canvas (the wordmark image's frame). */
  canvas: Point;
  star: { from: Square; to: Square };
  lines: Line[];
  block: { left: number; top: number; width: number; height: number };
}

export const name = {
  /** The name's size at the default text size: the wordmark's own. */
  base: geometry.wordmark.fontSize,
  /** It grows with Dynamic Type to about 1.5x, then stops, as symbols do. */
  max: 44,
  /** The side margin the longest word keeps on the narrowest screen. */
  margin: 32,
  /** Line height as a multiple of the size. */
  leading: 1.3,
  /** The settled star's size at the default name size. */
  star: 40,
  /** The gap between the settled star and the name. */
  gap: 24,
  /** How far the rest of a word slides in, in ems. */
  slide: 0.35,
} as const;

const longestWord = Math.max(...geometry.words.map((word) => word.advance));
const glyphHeight = geometry.font.ascent + geometry.font.descent;

/**
 * The name's font size: the wordmark's 30pt, up with Dynamic Type to `max`,
 * and never wider than the longest word can be on this screen. Each word is
 * one line, so nothing wraps or clips at any size.
 */
export function nameFontSize({ width, fontScale }: Frame): number {
  const fit = (width - 2 * name.margin) / longestWord;
  const wanted = Math.min(name.base * Math.max(1, fontScale), name.max);
  return Math.min(wanted, fit);
}

export function splashLayout(frame: Frame): SplashLayout {
  const insets = frame.safeArea ?? { top: 0, bottom: 0, left: 0, right: 0 };
  const regions = frame.regions ?? emptyReservedRegions;
  const safe: Rect = {
    x: insets.left,
    y: insets.top,
    width: Math.max(0, frame.width - insets.left - insets.right),
    height: Math.max(0, frame.height - insets.top - insets.bottom),
  };
  // Fit the full name on the preferred side before placing its fixed group.
  let fitting = safe;
  for (const division of regions.divisions.filter((region) => region.active)) {
    const sides = sidesOf(division, fitting);
    const [first, second] =
      'leading' in sides
        ? [sides.leading, sides.trailing]
        : [sides.top, sides.bottom];
    fitting =
      first.width * first.height > second.width * second.height
        ? first
        : second;
  }
  const size = nameFontSize({ ...frame, width: fitting.width });
  const lineHeight = Math.round(name.leading * size);
  // The first frame is the native storyboard's: the lockup's centre X and Y
  // are pinned to its container view, the whole window, with no safe area or
  // reserved region it could know about. Placing it anywhere else is a jump
  // at handoff (half a side rail on the closed iPhone Duo).
  const canvas = {
    x: (frame.width - geometry.canvas.width) / 2,
    y: (frame.height - geometry.canvas.height) / 2,
  };
  const starFrom = {
    x: canvas.x + geometry.mark.x,
    y: canvas.y + geometry.mark.y,
    size: geometry.mark.size,
  };
  const starSize = name.star * (size / name.base);
  const block = {
    width: longestWord * size,
    height: lineHeight * geometry.words.length,
    left: 0,
    top: 0,
  };
  const total = starSize + name.gap + block.height;
  const settled = placeClear(
    {
      x: fitting.x + (fitting.width - block.width) / 2,
      y: fitting.y + (fitting.height - total) / 2,
      width: block.width,
      height: total,
    },
    regions,
    safe,
  );
  const starTo = {
    x: settled.x + (settled.width - starSize) / 2,
    y: settled.y,
    size: starSize,
  };
  block.left = settled.x;
  block.top = settled.y + starSize + name.gap;
  const ascent = geometry.font.ascent * size;
  const glyph = { height: glyphHeight * size, ascent };
  const lines = geometry.words.map((word, index): Line => {
    const baseline =
      block.top + index * lineHeight + (lineHeight - glyph.height) / 2 + ascent;
    const at = Math.max(0, word.text.indexOf(splashCopy.wordmark[index]!));
    const pen = (glyph: number) => block.left + (word.pens[glyph] ?? 0) * size;
    return {
      text: word.text,
      baseline,
      letter: {
        text: word.text[at]!,
        from: {
          x: canvas.x + geometry.wordmark.pens[index]!,
          y: canvas.y + geometry.wordmark.baseline,
        },
        to: { x: pen(at), y: baseline },
      },
      before: at > 0 ? { text: word.text.slice(0, at), x: pen(0) } : null,
      rest: { text: word.text.slice(at + 1), x: pen(at + 1) },
    };
  });
  const flight = {
    x: Math.min(canvas.x, settled.x),
    y: Math.min(canvas.y, settled.y),
    right: Math.max(
      canvas.x + geometry.canvas.width,
      settled.x + settled.width,
    ),
    bottom: Math.max(
      canvas.y + geometry.canvas.height,
      settled.y + settled.height,
    ),
  };
  const travelClear = ![...regions.divisions, ...regions.occlusions].some(
    (region) =>
      region.active &&
      region.width > 0 &&
      region.height > 0 &&
      flight.x < region.x + region.width &&
      flight.right > region.x &&
      flight.y < region.y + region.height &&
      flight.bottom > region.y,
  );
  return {
    travelClear,
    size,
    lineHeight,
    glyph,
    canvas,
    star: { from: starFrom, to: starTo },
    lines,
    block,
  };
}

/** A line's windows, as fractions of the unfold (timing.ts `splash.windows`). */
export function letterWindow(index: number): [number, number] {
  return shifted(splash.windows.letter, index);
}
export function restWindow(index: number): [number, number] {
  return shifted(splash.windows.rest, index);
}
function shifted(
  span: readonly [number, number],
  index: number,
): [number, number] {
  const delay = index * splash.stagger;
  return [span[0] + delay, Math.min(1, span[1] + delay)];
}

/**
 * Worklets: the pure arithmetic the animated styles run on the UI thread.
 * `progress` is where `t` sits in a window, 0 to 1; `easeOut` is the
 * standard decelerating curve; `lerp` mixes two numbers by it.
 */
export function progress(t: number, span: readonly [number, number]) {
  'worklet';
  const [start, end] = span;
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}
export function easeOut(p: number) {
  'worklet';
  const inverse = 1 - p;
  return 1 - inverse * inverse * inverse;
}
export function lerp(from: number, to: number, p: number) {
  'worklet';
  return from + (to - from) * p;
}
