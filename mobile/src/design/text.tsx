import {
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Text as NativeText,
  PixelRatio,
  Platform,
  StyleSheet,
  useWindowDimensions,
  type TextLayoutEvent,
  type TextProps,
} from 'react-native';
import { useBoldText } from './accessibility';
import { spokenFigures } from './format';
import { bindRecordTitle, recordTitleRoles } from './record-title';
import { useTextProbe } from './text-probe';
import type { ProbeLine } from './text-probe.types';
import { androidCapScale, textRampScale } from './text-scale';
import {
  boldStep,
  contentSizeCategory,
  contentSizeScales,
  textStyles,
  type Role,
  type TextVariant,
} from './tokens';
import { useColors, type Colors } from './use-colors';

export type TextTone =
  | Extract<
      Role,
      | 'ink'
      | 'inkSoft'
      | 'inkFaint'
      | 'danger'
      | 'navy'
      | 'onNavy'
      | 'onNavySoft'
      | 'onBand'
      | 'onBandSoft'
      | 'moneyInk'
      | 'votesInk'
      | 'interestsInk'
      | 'billsInk'
    >
  | 'link';
export interface OpaxTextProps extends TextProps {
  variant?: TextVariant;
  /**
   * Override the role's colour. `inkFaint` is for paper and raised surfaces
   * only; on sunken surfaces and tags use `inkSoft`.
   */
  tone?: TextTone;
  /**
   * Keep words whole. React Native has no hyphenation on iOS, so this text
   * steps its own scale down only after a measured mid-word break, as far as
   * its longest word needs, with an 11pt floor. The steps are shared by every
   * reader text size, so a larger setting never draws smaller (on iOS, and on
   * Android with linear font scaling).
   * URLs and email addresses wrap at full size instead of stepping down.
   * Headings, control labels and field labels use it.
   */
  wordSafe?: boolean;
  /**
   * Tabular figures, so digits line up in columns and counts do not jitter:
   * `strong` with `tabular` is an inline figure. `figure` and `tileFigure` are always tabular.
   */
  tabular?: boolean;
  /** Code citation formats keep the body role and its scaling in a fixed-width face. */
  monospace?: boolean;
  /**
   * Native drawing check enabled in e2e. Production resolves a no-op module
   * and excludes the diagnostic implementation and its prop factory.
   */
  testDrawnText?: boolean;
}

/**
 * A role's colour in the colours on screen (`useColors()`). iOS resolves
 * dark and Increase Contrast natively; on Android the set passed in is the
 * scheme's, with the stronger roles while High contrast text is on.
 */
export function roleColour(tone: Role | 'link', colors: Colors) {
  return colors[tone === 'link' ? 'navy' : tone];
}

/**
 * Added to every role's line height. RN's text measurement ceils to the pixel
 * grid, before Yoga rounds the final drawing frame. When
 * n lines of the scaled line height land exactly on the grid (24pt subheading
 * at AX5 on a 3x screen: 6 x 62.22 = 373.33), the ceil adds no slack and
 * floating-point noise in the frame can leave the last line "not fitting":
 * TextKit then draws the line before it with the rest of the text, clipped at
 * the edge ("party receipts a"). A thousandth of a point with a prime
 * denominator moves the total off the grid for any realistic line count, so
 * the measurement has slack. It is invisible on screen. Yoga can still round
 * the final frame below that measurement; `pixelSlack` below reserves that
 * shortfall in the measured height. Neither protection replaces the other.
 */
export const LINE_HEIGHT_NUDGE = 1 / 997;

/**
 * A hundredth of a physical pixel under every iOS Text, so its frame is
 * never shorter than its lines.
 *
 * React Native ceils a text's measured height to whole pixels, and Yoga then
 * rounds a text node whose height is whole pixels by flooring both its top
 * and its bottom edge (PixelGrid.cpp: `textRounding && !hasFractionalHeight`).
 * Positions are stored as 32-bit floats, and thirds of a point (a 3x screen)
 * are not exact: summed down a tall page the bottom edge can land a hair
 * under its pixel while the top lands on its own, and the floor takes a
 * whole pixel off the frame (a 141.182 pt AX5 line measured 141.333 and
 * framed 141). TextKit then drops the last line. About one text in a hundred
 * at 3x in a model of tall pages; never at 2x, where halves are exact.
 *
 * A height with a fractional pixel takes Yoga's other branch: the bottom
 * edge is ceiled, so the frame is the measured height and a pixel more, from
 * the first layout. Until b77 every Text was instead given a floor of
 * `ceil(height) + 1` after its first layout: one more render and layout for
 * each, and rows that mounted late grew 1 to 2 pt a line on screen.
 *
 * The frame is `ceil(top's fraction + slack)` pixels over its measure, so it
 * still depends on where the text sits: one pixel over, or two when the top
 * is within the slack of the next pixel. The slack is therefore small (Yoga
 * counts anything over a ten-thousandth of a pixel as a fraction): half a
 * pixel gave two pixels at every top past the half, a hundredth only in the
 * last hundredth. No size removes it, so a measured text height must never
 * be fed back raw into the text's own position: Today's section header set
 * its action's margin from its title's height in a centred row, and flipped
 * between the two frames without end until it ignored changes under a point
 * (`SectionHeader`).
 */
export const pixelSlack = (scale: number) =>
  Platform.OS === 'ios' && scale > 0 ? 0.01 / scale : 0;
/** A caller's own bottom padding on a Text, which the slack is added to. */
function bottomPadding(style: TextProps['style']): number {
  if (!style) return 0;
  const flat = StyleSheet.flatten(style);
  const value = flat?.paddingBottom ?? flat?.paddingVertical ?? flat?.padding;
  return typeof value === 'number' ? value : 0;
}

/**
 * True when the laid-out lines hold all the words. A dropped final line
 * leaves fewer characters than the words have; lines may hold more (a nested
 * component's text is not in `content`), and spacing differs (a trailing
 * no-break space is not in the line's text).
 */
const linesCarry = (lines: readonly { text: string }[], content: string) => {
  const plain = (text: string) => text.replace(/\s/g, '');
  return (
    plain(lines.map((line) => line.text).join('')).length >=
    plain(content).length
  );
};

const letter = /[0-9A-Za-zÀ-ÖØ-öø-ɏ]/;
/** True when a laid-out line ends inside a word that continues on the next line. */
export function breaksMidWord(lines: readonly { text: string }[]): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    const end = lines[i]!.text.slice(-1);
    const start = lines[i + 1]!.text.charAt(0);
    if (letter.test(end) && letter.test(start)) return true;
  }
  return false;
}

/** All the text a node renders, nested Text included, in order. */
export function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (isValidElement<{ children?: ReactNode }>(node))
    return textContent(node.props.children);
  return '';
}

/**
 * The Dynamic Type multiplier in effect, to two places, from a laid-out line
 * height (line heights scale with the same multiplier as the font).
 */
export function lineScale(lineHeight: number, baseLineHeight: number): number {
  return Math.round((lineHeight / baseLineHeight) * 100) / 100;
}

/**
 * The smallest size word-safe text steps down to, in points: Apple's smallest
 * default text size (caption2 at Large).
 */
export const WORD_SAFE_MIN_POINTS = 11;

/**
 * The lowest word-safe cap for a role: the reader's default size, or below it
 * down to WORD_SAFE_MIN_POINTS. A word wider than a narrow column at the
 * default size, such as "(Strengthening" (about 125pt in rowRecord) in the
 * iPhone Duo's folded two-column cards, otherwise stopped at 1 and broke
 * mid-word ("Strengtheni / ng") for good.
 */
export function wordSafeFloor(fontSize: number): number {
  if (!(fontSize > 0)) return 1;
  return Math.min(1, Math.ceil((WORD_SAFE_MIN_POINTS / fontSize) * 100) / 100);
}

/**
 * The next scale cap after a mid-word break, from the line height in effect.
 * Null when the text is already at the floor or below. The floor defaults to
 * the reader's default size; Text passes its role's wordSafeFloor.
 */
export function nextWordSafeCap(
  lineHeight: number,
  baseLineHeight: number,
  floor = 1,
): number | null {
  const current = lineScale(lineHeight, baseLineHeight);
  if (current <= floor + 0.01) return null;
  return Math.max(floor, Math.round(current * 90) / 100);
}

/** No two word-safe sizes are further apart than this ratio. */
const WORD_SAFE_STEP = 0.9;

/**
 * The sizes word-safe text steps down through, largest first, as multipliers
 * of the role's default size, ending at `floor`. They are the same for every
 * reader. Ten per cent steps from each reader's own size gave each reader a
 * different set of sizes, so "(Strengthening" in a 110pt column drew 16pt at
 * Medium but 15.3pt at Large, and 14.6pt at AX4 below 14.9pt at AX1.
 *
 * `anchors` holds each reader text size's full size for the role. A reader
 * whose words fit keeps their own size. A reader whose size breaks a word
 * settles on the largest of these sizes that fits. That is never smaller than
 * the size of any smaller reader whose words fit, because that size is among
 * the anchors. So a larger text setting never draws smaller. Gaps wider than
 * 10% between anchors are filled, so no step loses more than 10%.
 */
export function wordSafeSizes(
  anchors: readonly number[],
  floor: number,
): number[] {
  const points = anchors
    .filter((size) => size > floor + 0.01)
    .sort((a, b) => b - a);
  const sizes: number[] = [];
  for (const point of [...points, floor]) {
    const above = sizes[sizes.length - 1];
    if (above !== undefined) {
      if (above - point < 0.005) continue;
      const steps = Math.ceil(
        Math.log(point / above) / Math.log(WORD_SAFE_STEP) - 1e-9,
      );
      for (let i = 1; i < steps; i++)
        sizes.push(above * (point / above) ** (i / steps));
    }
    sizes.push(point);
  }
  return sizes;
}

// Android's standard font sizes (Settings, Font size), then 10% steps for
// larger custom scales.
const androidScales = [
  0.85,
  1,
  1.15,
  1.3,
  1.5,
  1.8,
  2,
  ...Array.from({ length: 7 }, (_, i) => 2 / WORD_SAFE_STEP ** (i + 1)),
];
const roleSizes = new Map<string, readonly number[]>();
/**
 * A role's word-safe sizes (wordSafeSizes), computed once per role. On iOS the
 * anchors are each Dynamic Type size's full size for the role, worked out as
 * Text works out `full`: its ramp, maxFontSizeMultiplier and the title
 * ceiling. Android's native metrics convert only at the device's own font
 * scale, so the anchors there are its standard font scales. With linear SP
 * scaling those are each reader's own size, as on iOS. Android 14's nonlinear
 * scaling draws other sizes, so a smaller reader can still draw slightly
 * larger there, but every reader whose size breaks a word settles on the
 * same size.
 */
export function roleWordSafeSizes(
  variant: TextVariant,
  maxFontSizeMultiplier = 0,
  os: string = Platform.OS,
): readonly number[] {
  const key = `${variant}|${maxFontSizeMultiplier}|${os}`;
  const known = roleSizes.get(key);
  if (known) return known;
  const role = textStyles[variant];
  const anchors =
    os === 'ios'
      ? contentSizeScales.map(
          (scale) =>
            (textRampScale(
              role.dynamicTypeRamp,
              scale,
              maxFontSizeMultiplier,
              'ios',
            ) ?? scale) * titleSizeCap(variant, scale, 'ios'),
        )
      : androidScales;
  const sizes = wordSafeSizes(anchors, wordSafeFloor(role.fontSize));
  roleSizes.set(key, sizes);
  return sizes;
}

/**
 * The next of `sizes` at least `step` below `current`, and at or below
 * `fits`; null at the floor. Sizes above `fits` are proven to break the word
 * still, so skipping them keeps the largest size that fits.
 */
function nextWordSafeSize(
  current: number,
  floor: number,
  sizes: readonly number[],
  step: number,
  fits = Infinity,
): number | null {
  if (current <= floor + 0.01) return null;
  return Math.max(
    floor,
    sizes.find((size) => size < current - step && size <= fits) ?? floor,
  );
}

// A line holding only part of one unbreakable run: letters, digits,
// apostrophes and brackets, with no space, hyphen or other break opportunity.
const runOnly = /^[\p{L}\p{N}'’()[\]]+$/u;
/**
 * A lower bound on the widest word broken across lines, in the layout's own
 * points: the summed width of the lines that hold nothing but that word.
 * A word over several whole lines (AX5 in a narrow card) is at least that
 * wide, so every size at which that width would still overflow the column can
 * be skipped. Lines with any break opportunity count for nothing.
 */
function brokenRunWidth(lines: readonly WordSafeLine[]): number {
  let widest = 0;
  let run = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // A line joins the run above only across a mid-word break, and only a
    // line that is all one run carries it on.
    if (i === 0 || !breaksMidWord([lines[i - 1]!, line])) run = 0;
    run =
      runOnly.test(line.text) && Number.isFinite(line.width)
        ? run + line.width
        : 0;
    widest = Math.max(widest, run);
  }
  return widest;
}

// Apple's title1 ramp. The recordTitle role alone stops at AX2 (43pt).
const recordTitleSizes = {
  xSmall: 25,
  small: 26,
  medium: 27,
  large: 28,
  xLarge: 30,
  xxLarge: 32,
  xxxLarge: 34,
  ax1: 38,
  ax2: 43,
  ax3: 48,
  ax4: 53,
  ax5: 58,
} as const;
export function titleSizeCap(
  variant: TextVariant,
  fontScale: number,
  os: string = Platform.OS,
): number {
  if (!['recordTitle', 'title', 'padTitle'].includes(variant)) return 1;
  const growth =
    os === 'android'
      ? fontScale
      : recordTitleSizes[contentSizeCategory(fontScale)] /
        recordTitleSizes.large;
  const ceiling = recordTitleSizes.ax2 / recordTitleSizes.large;
  return growth > ceiling ? ceiling / growth : 1;
}

/**
 * Android only. React Native caps `fontSize` with `maxFontSizeMultiplier` but
 * converts an explicit `lineHeight` from SP without it, so capped text kept
 * full-size leading: at font scale 2.0 a wrapped 1.353-capped line took twice
 * its text height. The cap is folded into the role's own size and line height
 * instead, like the title ceiling, and the native cap is then left off so it
 * is not applied twice. Returns the multiplier on the role (1 when the cap is
 * not reached). iOS keeps the native cap, which scales both.
 */
export function androidSizeCap(
  baseLineHeight: number,
  maxFontSizeMultiplier: number | null | undefined,
  fontScale: number,
  os: string = Platform.OS,
): number {
  if (os !== 'android' || !maxFontSizeMultiplier || maxFontSizeMultiplier < 1)
    return 1;
  return Math.min(
    1,
    androidCapScale(baseLineHeight, maxFontSizeMultiplier, fontScale) ??
      maxFontSizeMultiplier / fontScale,
  );
}

/**
 * A word-safe text's state for one identity: text size, window width, role,
 * weight and text. Every change of cap starts a logical generation. Event
 * callbacks alone cannot identify Fabric events, which use current props.
 * The expected role scale and a matching frame reject stale measurements.
 * Generations must never key the native Text: replacing
 * it destroys the accessibility element and loses VoiceOver/TalkBack focus.
 */
export interface WordSafeState {
  key: string;
  gen: number;
  /** The cap on the Dynamic Type multiplier; 0 is full size. */
  cap: number;
  /** Expected uncapped multiplier, including the role's title ceiling. */
  full: number;
  /** The full-size generation, and the frame width it was laid out in. */
  fullGen: number;
  fullFrame: number;
  /** The capped instance's frame width, and its longest unbreakable run of
   * text scaled to full size (an upper bound: its widest line). */
  frame: number;
  word: number;
  /** The size the generation before this one drew; 0 when there was none. */
  prev: number;
}
/** The measurement identity captured by an event callback. */
export interface WordSafeInstance {
  key: string;
  gen: number;
}
export const wordSafeStart = (
  key: string,
  full = 0,
  gen = 0,
): WordSafeState => ({
  key,
  gen,
  cap: 0,
  full,
  fullGen: gen,
  fullFrame: 0,
  frame: 0,
  word: 0,
  prev: 0,
});
/** Two-place rounding of the line height leaves this much noise. */
const MEASURED_AT_TOLERANCE = 0.03;
/**
 * The smallest step. A layout queued from the size before a step belongs to
 * whichever size it measures nearer (WordSafeState.prev), so a step need only
 * clear the noise in each measurement twice over. On iOS that is two-place
 * rounding (0.005), which keeps Apple's 1pt steps of the largest roles (2.9%
 * at figure's 34pt), so a larger setting never draws smaller. Android's line
 * heights round to whole pixels too (up to 0.024 for a 16dp line), and its own
 * sizes are all further apart than this.
 */
const wordSafeStep = (os: string) =>
  os === 'ios' ? 0.015 : 2 * MEASURED_AT_TOLERANCE;
/** Frame widths are compared to the half point; fits keep a point spare. */
const WIDTH_EPSILON = 0.5;
const FIT_MARGIN = 1;
const compact = (text: string) => text.replace(/\s/g, '');

type WordSafeLine = {
  text: string;
  width: number;
  height: number;
  y?: number;
};
/**
 * TextKit may include trailing spaces outside a wrapped line's column.
 * Allow at most one drawn em per space, as an upper bound on that overhang.
 * The column still bounds the visible glyphs: clamping to it keeps the word
 * estimate conservative, and genuine visible overflow keeps its raw width.
 */
function visibleLineWidth(
  line: WordSafeLine,
  column: number,
  drawnPoints: number,
): number {
  if (!Number.isFinite(line.width)) return Infinity;
  const trailing = /[ \t]+$/.exec(line.text)?.[0].length ?? 0;
  return trailing &&
    drawnPoints > 0 &&
    line.width <= column + trailing * drawnPoints + WIDTH_EPSILON
    ? Math.min(line.width, column)
    : line.width;
}
/**
 * iOS reports TextKit's used rect, rather than the paragraph's line advance.
 * Measure the advance between line origins. Treating the rect's height as
 * the advance rejected fresh serif layouts as stale scales before they could
 * reach the word-safe floor. Older events without origins retain the
 * height-based fallback.
 */
function wordSafeLineHeight(lines: readonly WordSafeLine[]): number {
  const first = lines[0]!;
  const advance = (lines[1]?.y ?? NaN) - (first.y ?? NaN);
  return Number.isFinite(advance) && advance > 0 ? advance : first.height;
}
/** Full size again, as a new generation; the uncapped multiplier still holds. */
const restart = (state: WordSafeState): WordSafeState => ({
  ...wordSafeStart(state.key, state.full, state.gen + 1),
  prev: state.cap,
});
/**
 * The column grew enough: the capped instance's frame is wider than the one
 * full size broke in, and every unbreakable run of its text, scaled back to
 * full size, fits in it. Glyph advances scale linearly with point size.
 */
function provenToFit(state: WordSafeState): WordSafeState {
  return state.cap &&
    state.word &&
    state.frame &&
    state.fullFrame &&
    state.frame > state.fullFrame + WIDTH_EPSILON &&
    state.word + FIT_MARGIN <= state.frame
    ? restart(state)
    : state;
}

/**
 * The state after one line measurement. Only the generation now drawn counts,
 * and only for this text. The cap only steps down, one of `sizes` at a time
 * (roleWordSafeSizes), after a mid-word break measured at the size now drawn.
 * Without `sizes` (direct callers) it steps 10% below the measured size. At
 * any reader text size it may step below the role's default size, to `floor`
 * (wordSafeFloor), when a word is still wider than its column (a layout from
 * a larger size delivered late included). The first measurement must
 * also match the expected full scale when native conversion is available.
 * Without it, retain the measurement-backed baseline used by older binaries.
 * Returns `state` itself when nothing changes.
 */
export function wordSafeOnLines(
  state: WordSafeState,
  at: WordSafeInstance,
  lines: readonly WordSafeLine[],
  content: string,
  baseLineHeight: number,
  validateScale = true,
  floor = 1,
  fontSize = 0,
  sizes: readonly number[] = [],
  os: string = Platform.OS,
): WordSafeState {
  if (at.key !== state.key || at.gen !== state.gen || !lines.length)
    return state;
  if (!Number.isFinite(state.full) || state.full < 0) return state;
  if (!state.fullFrame) return state;
  if (compact(lines.map((line) => line.text).join('')) !== compact(content))
    return state;
  const lineHeight = wordSafeLineHeight(lines);
  const measuredAt = lineScale(lineHeight, baseLineHeight);
  if (!Number.isFinite(measuredAt)) return state;
  const visibleWidth = (line: WordSafeLine) =>
    visibleLineWidth(
      line,
      state.frame || state.fullFrame,
      fontSize * measuredAt,
    );
  // A full-size, whole-word layout that fits the current frame proves every
  // word fits, even if it arrives after a queued narrow-column break capped
  // us. This also recovers when both columns happen to have the same height.
  // Only a layout that is clearly not the cap's own counts: a cap within the
  // tolerance of full size (a last step to a floor just below it) would
  // otherwise fit, restart, break and fit again on every frame. Steps clear
  // the tolerance otherwise (wordSafeStep). Nor does a one-line layout:
  // with no line advance its height is TextKit's used rect, a point taller,
  // which can make a capped line read as full size ("Community" at Large).
  if (
    state.cap &&
    state.frame &&
    lines.length > 1 &&
    Math.abs(measuredAt - state.cap) > MEASURED_AT_TOLERANCE &&
    Math.abs(measuredAt - state.full) <= MEASURED_AT_TOLERANCE &&
    !breaksMidWord(lines) &&
    lines.every((line) => visibleWidth(line) <= state.frame + WIDTH_EPSILON)
  )
    return restart(state);
  const drawnAt = state.cap || state.full;
  if (
    validateScale &&
    drawnAt &&
    Math.abs(measuredAt - drawnAt) > MEASURED_AT_TOLERANCE
  )
    return state;
  // A layout nearer the size drawn before this one is that size's, queued and
  // delivered to current props: it must not step the new size again. Only
  // where native conversion validated the scale; without it a cap can draw
  // nearer the size before (1.29 for 1.23 after 1.33).
  if (
    validateScale &&
    drawnAt &&
    state.prev &&
    Math.abs(measuredAt - state.prev) < Math.abs(measuredAt - drawnAt)
  )
    return state;
  if (breaksMidWord(lines)) {
    // Step from the exact size drawn, which the measurement must agree with:
    // a two-place measured scale can round up to the size just taken. Without
    // native conversion (validateScale false) the first layout has no exact
    // size, and Android's nonlinear SP scaling can draw a cap above itself
    // (1.29 for 1.23 at 200%), where the next size below the measured one is
    // the cap again. Those step 10% below the measured size, as before.
    // A word wider than several whole lines skips the sizes at which it
    // would still overflow its column, even 10% narrower per point than it
    // measured (glyph advances scale nearly, not exactly, with size). Only
    // on iOS, where the font scales with the line height: Android 14's
    // nonlinear SP scaling shrinks the font faster than the line, so a skip
    // there could pass a size that fits.
    const column = state.frame || state.fullFrame;
    const run = os === 'ios' ? brokenRunWidth(lines) : 0;
    const fits =
      run > column ? (drawnAt * column) / run / WORD_SAFE_STEP : Infinity;
    const next =
      sizes.length &&
      drawnAt &&
      Math.abs(measuredAt - drawnAt) <= MEASURED_AT_TOLERANCE
        ? nextWordSafeSize(drawnAt, floor, sizes, wordSafeStep(os), fits)
        : nextWordSafeCap(lineHeight, baseLineHeight, floor);
    if (next === null || (state.cap && next >= state.cap)) return state;
    return {
      ...state,
      gen: state.gen + 1,
      cap: next,
      prev: drawnAt || measuredAt,
      // Native conversion validates the ramp when available, and its exact
      // scale stays the baseline: the two-place measured one drew every cap
      // up to 0.4% off its size (15.97pt for 16pt at xLarge). Otherwise this
      // first matching frame/content pair supplies the measured baseline.
      full:
        state.cap || (validateScale && state.full) ? state.full : measuredAt,
      frame: 0,
      word: 0,
    };
  }
  if (!state.cap) return state;
  // No run breaks at this cap, so each lies within one line.
  const widest = Math.max(...lines.map(visibleWidth));
  const word = (widest * state.full) / measuredAt;
  return provenToFit(state.word === word ? state : { ...state, word });
}

/**
 * The state after a frame. A capped generation draws one font and one text, so
 * any widening of its frame is its column widening: start again from full
 * size and step down afresh, which also restores a larger cap after a
 * narrower column widens again. A frame from the full-size generation, even
 * one delivered after the cap moved on, records where full size broke.
 */
export function wordSafeOnFrame(
  state: WordSafeState,
  at: WordSafeInstance,
  width: number,
): WordSafeState {
  if (at.key !== state.key || !(width > 0)) return state;
  if (at.gen === state.fullGen && (at.gen !== state.gen || !state.cap))
    return state.fullFrame === width
      ? state
      : provenToFit({ ...state, fullFrame: width });
  if (at.gen !== state.gen || !state.cap) return state;
  if (state.frame && width > state.frame + WIDTH_EPSILON) return restart(state);
  if (state.frame === width) return state;
  return provenToFit({ ...state, frame: width });
}

/**
 * All content text. Scales with its Dynamic Type ramp to AX5 with no fixed
 * cap and no line limit; never pass `numberOfLines` for names, titles, figures
 * or caveats.
 */
export function Text({
  variant = 'body',
  tone,
  style,
  wordSafe: wantsWordSafe = false,
  tabular: tabularProp = false,
  monospace = false,
  onTextLayout,
  onLayout,
  ...given
}: OpaxTextProps) {
  // A record title never ends on a lone short word (bindRecordTitle). The
  // no-break space is for layout only: when binding changed the text, the
  // label keeps the words as published (VoiceOver, and Maestro's text match
  // through the accessibility label), unless the caller set its own.
  const titleRole = recordTitleRoles.includes(variant);
  const bound = titleRole ? bindRecordTitle(given.children) : given.children;
  const published = textContent(given.children);
  const spoken = spokenFigures(given.accessibilityLabel ?? published);
  const props =
    bound === given.children &&
    spoken === (given.accessibilityLabel ?? published)
      ? given
      : {
          ...given,
          children: bound,
          accessibilityLabel: spoken,
        };
  const bold = useBoldText();
  const colors = useColors();
  const role = textStyles[variant];
  const family =
    role.fontFamily === undefined
      ? undefined
      : bold
        ? (boldStep[role.fontFamily] ?? role.fontFamily)
        : role.fontFamily;
  const drawnFamily = monospace && Platform.OS === 'ios' ? 'Menlo' : family;
  const weight =
    family !== role.fontFamily
      ? family?.endsWith('SemiBold')
        ? '600'
        : '700'
      : role.fontWeight;
  const tabular = tabularProp || ('tabular' in role && role.tabular);
  const { fontScale, width, scale } = useWindowDimensions();
  // A cap belongs to one text size, window width, role, weight and text
  // (nested text included, such as a field's "(required)"): any change starts
  // again from full size, and so does a wider column (wordSafeOnFrame).
  const content = textContent(props.children);
  // Addresses need character wrapping, including inside generic row text.
  const wordSafe =
    wantsWordSafe &&
    !/(?:\b[a-z][a-z\d+.-]*:\/\/|\bwww\.|[^\s@]+@[^\s@]+|\b[a-z\d-]+\.[a-z]{2,}(?:[/?#]\S*)?(?=\s|$))/i.test(
      content,
    );
  const baseLineHeight = role.lineHeight + LINE_HEIGHT_NUDGE;
  const androidCap = androidSizeCap(
    baseLineHeight,
    given.maxFontSizeMultiplier,
    fontScale,
  );
  // The title ceiling and Android's folded cap, whichever is lower.
  const sizeCap = Math.min(titleSizeCap(variant, fontScale), androidCap);
  const rampScale = textRampScale(
    role.dynamicTypeRamp,
    fontScale,
    given.maxFontSizeMultiplier ?? 0,
    Platform.OS,
    baseLineHeight * sizeCap,
  );
  const expectedFull =
    rampScale === undefined ? undefined : rampScale * sizeCap;
  const key = `${fontScale}|${width}|${variant}|${bold}|${drawnFamily}|${given.maxFontSizeMultiplier}|${content}`;
  // The state machine runs at event time in a ref, so frames and lines that
  // change nothing drawn never render; `shown` re-renders on a new generation.
  const [shown, setShown] = useState(() => wordSafeStart(key, expectedFull));
  const machine = useRef(shown);
  const committedKey = useRef(key);
  useLayoutEffect(() => {
    committedKey.current = key;
  });
  const drawn = shown.key === key ? shown : wordSafeStart(key, expectedFull);
  const { cap, full } = drawn;
  const instance: WordSafeInstance = { key: drawn.key, gen: drawn.gen };
  const advance = (step: (state: WordSafeState) => WordSafeState) => {
    // A callback from an earlier measurement identity, delivered late.
    if (instance.key !== committedKey.current) return;
    if (machine.current.key !== instance.key) {
      const earlier = machine.current;
      machine.current = wordSafeStart(instance.key, expectedFull);
      // Returning to that identity later must not draw its old cap.
      if (earlier.gen) setShown(machine.current);
    }
    const previous = machine.current;
    const next = step(previous);
    if (next === previous) return;
    machine.current = next;
    if (next.gen !== previous.gen) setShown(next);
  };
  // React Native's text measure cache compares fonts by size, multiplier and
  // ramp but not maxFontSizeMultiplier, so a cap passed that way keeps the
  // cached full-size layout and drawing ("Parliamentar / y" in About at AX5).
  // The cap scales the role's own size and line height instead, which the
  // cache does compare; Dynamic Type multiplies the result by the same ramp.
  // The title's AX2 ceiling works the same way, under any word-safe cap:
  // measured line heights include it, so the steps stay in drawn sizes.
  const capScale =
    wordSafe && cap && full
      ? Platform.OS === 'android'
        ? (androidCapScale(baseLineHeight, cap, fontScale) ??
          (cap / full) * sizeCap)
        : (cap / full) * sizeCap
      : sizeCap;
  const heightKey = `${key}|${cap}|${scale}`;
  const probe = useTextProbe(props, heightKey, content);
  const measured = useRef<{
    key: string;
    initial?: boolean;
    verified?: boolean;
    frame?: { width: number; height: number };
    lines?: readonly ProbeLine[];
    /** Lines kept across a width reset: they may be the old width's. */
    linesFromBefore?: boolean;
  }>({ key: heightKey, initial: true });
  const currentMeasurement = () => {
    if (measured.current.key !== heightKey)
      measured.current = { key: heightKey };
    return measured.current;
  };
  const [heightGuard, setHeightGuard] = useState({
    key: '',
    width: 0,
    minimum: 0,
  });
  const nativeText = useRef<NativeText>(null);
  const listensForLines = wordSafe || probe.enabled || !!onTextLayout;
  const guardDrawing = () => {
    const { frame, lines, verified, linesFromBefore } = measured.current;
    if (!frame || frame.height <= 0 || frame.width <= 0) return;
    // The height floor repairs TextKit rounding on iOS. Android measures its
    // own glyph bounds; adding a floor there re-lays out every mounted Text.
    if (Platform.OS === 'android') {
      if (probe.enabled) probe.update(lines, frame);
      return;
    }
    // The slack in the measured height (pixelSlack) keeps a frame from
    // rounding below its lines, so nothing grows after its first layout. The
    // floor remains only for a Text whose drawing is proven short by its own
    // line event: lines that do not carry its words, a line that ends below
    // its frame, or an event with no line at all.
    // Silence proves nothing. A Text that listens often hears no line event
    // (on the device, four of Today's at AX5 heard none in 250 ms with the
    // JS thread idle), so a floor taken on a timer grew healthy text 1 to
    // 2 pt well after it was drawn. With the slack, a frame cannot round
    // below even its first line, which is the only way a first line was
    // ever silently lost.
    // Queued onLayout events carry no identity or font scale. After a new
    // heightKey, only measure() of the committed, unguarded view may set the
    // floor. On first mount there is no previous identity to queue a frame.
    // A guarded frame must never add another point to an established floor.
    if (
      verified &&
      !(heightGuard.key === heightKey && heightGuard.minimum > 0)
    ) {
      if (lines?.length && linesFromBefore) {
        // No proof either way until this width's own lines arrive.
      } else if (lines?.length) {
        const bottom = Math.max(
          ...lines.map((line) =>
            Number.isFinite(line.y) ? line.y + line.height : 0,
          ),
        );
        if (
          bottom > frame.height + 0.01 ||
          (content.trim() !== '' &&
            !given.numberOfLines &&
            !linesCarry(lines, content))
        )
          setHeightGuard({
            key: heightKey,
            width: frame.width,
            // One whole point survives Yoga rounding.
            minimum: Math.max(Math.ceil(frame.height) + 1, Math.ceil(bottom)),
          });
      } else if (lines && !linesFromBefore && content.trim() !== '') {
        // An event with no line at all, for words that are there: nothing
        // fitted the frame. This is proof, whether or not the Text has had
        // lines before.
        setHeightGuard({
          key: heightKey,
          width: frame.width,
          minimum: Math.ceil(frame.height) + 1,
        });
      }
    }
    probe.update(lines, frame);
  };
  const fitLines = () => {
    if (!wordSafe) return;
    const { frame, lines } = currentMeasurement();
    // onTextLayout can precede onLayout. Buffer it until this identity/step
    // has a frame. A queued portrait break cannot fit a one-line landscape
    // frame, and a queued wider layout cannot fit a narrower column.
    if (!frame || !lines?.length) return;
    const hasOrigins = lines.every((line) => Number.isFinite(line.y));
    const bottom = hasOrigins
      ? Math.max(...lines.map((line) => line.y + line.height))
      : lines.reduce((sum, line) => sum + line.height, 0);
    const drawnPoints =
      role.fontSize * lineScale(wordSafeLineHeight(lines), baseLineHeight);
    if (
      bottom > frame.height + 1 ||
      // A missing width cannot prove overflow; only a reported one can.
      lines.some(
        (line) =>
          line.width > frame.width + WIDTH_EPSILON &&
          visibleLineWidth(line, frame.width, drawnPoints) >
            frame.width + WIDTH_EPSILON,
      )
    )
      return;
    advance((state) =>
      wordSafeOnLines(
        state,
        instance,
        lines,
        content,
        role.lineHeight + LINE_HEIGHT_NUDGE,
        expectedFull !== undefined,
        wordSafeFloor(role.fontSize),
        role.fontSize,
        roleWordSafeSizes(variant, given.maxFontSizeMultiplier ?? 0),
        Platform.OS,
      ),
    );
  };
  const onFrame = (
    frame: { width: number; height: number },
    committed = false,
  ) => {
    if (frame.width <= 0 || frame.height <= 0) return;
    if (wordSafe)
      advance((state) => wordSafeOnFrame(state, instance, frame.width));
    if (
      Platform.OS !== 'android' &&
      heightGuard.key === heightKey &&
      Math.abs(heightGuard.width - frame.width) > 0.01
    ) {
      // Keep pending lines, but accept them only against the unguarded frame
      // measured after removing the old width's floor.
      const measurement = currentMeasurement();
      measured.current = {
        key: heightKey,
        initial: measurement.initial,
        lines: measurement.lines,
        linesFromBefore: true,
      };
      setHeightGuard({ key: heightKey, width: frame.width, minimum: 0 });
      probe.reset();
      return;
    }
    const measurement = currentMeasurement();
    measurement.frame = frame;
    measurement.verified = committed || measurement.initial;
    guardDrawing();
    fitLines();
  };
  const onLayoutLines = (event: TextLayoutEvent) => {
    onTextLayout?.(event);
    const measurement = currentMeasurement();
    measurement.lines = event.nativeEvent.lines;
    measurement.linesFromBefore = false;
    guardDrawing();
    fitLines();
  };
  const frameReceiver = useRef(onFrame);
  useLayoutEffect(() => {
    frameReceiver.current = onFrame;
  });
  useLayoutEffect(() => {
    if (
      heightGuard.key !== heightKey ||
      heightGuard.minimum !== 0 ||
      heightGuard.width <= 0
    )
      return;
    // Removing a floor need not change the final dimensions, so onLayout may
    // not fire again. Measure the committed, unguarded native frame explicitly.
    // This runs only after a container-width reset, never on ordinary mounts.
    let active = true;
    nativeText.current?.measure((_x, _y, width, height) => {
      if (
        !active ||
        Math.abs(width - heightGuard.width) > 0.01 ||
        width <= 0 ||
        height <= 0
      )
        return;
      frameReceiver.current({ width, height }, true);
    });
    return () => {
      active = false;
    };
  }, [heightGuard, heightKey]);
  useLayoutEffect(() => {
    if (measured.current.key !== heightKey)
      measured.current = { key: heightKey };
    const measurement = measured.current;
    if (
      !wordSafe &&
      (Platform.OS === 'android' || measurement.initial || !listensForLines)
    )
      return;
    // Text/content can change without changing the frame, suppressing onLayout.
    // Measure an iOS Text that listens for its lines after an identity
    // change: a floor must use the current native size, never a queued frame.
    // (A plain Text takes no floor: its slack is in its measured height.)
    // Its callback is cancelled when another identity/step commits.
    let active = true;
    nativeText.current?.measure((_x, _y, width, height) => {
      if (active) frameReceiver.current({ width, height }, true);
    });
    return () => {
      active = false;
    };
  }, [heightKey, wordSafe, listensForLines]);
  const slack = pixelSlack(scale || PixelRatio.get());
  return (
    <NativeText
      // Names and party abbreviations are read with Australian English rules.
      accessibilityLanguage="en-AU"
      {...probe.props}
      accessibilityRole={
        given.accessibilityRole ??
        ([
          'largeTitle',
          'pageTitle',
          'recordTitle',
          'recordHeading',
          'sectionTitle',
          'subsectionTitle',
        ].includes(variant)
          ? 'header'
          : undefined)
      }
      ref={nativeText}
      onTextLayout={
        wordSafe || probe.enabled || onTextLayout ? onLayoutLines : undefined
      }
      onLayout={
        Platform.OS === 'android' && !wordSafe && !probe.enabled && !onLayout
          ? undefined
          : (event) => {
              onLayout?.(event);
              onFrame(event.nativeEvent.layout);
            }
      }
      allowFontScaling
      maxFontSizeMultiplier={
        androidCap < 1 ? 0 : (given.maxFontSizeMultiplier ?? 0)
      }
      dynamicTypeRamp={role.dynamicTypeRamp}
      {...(Platform.OS === 'android'
        ? {
            android_hyphenationFrequency: 'none' as const,
            textBreakStrategy: 'highQuality' as const,
          }
        : {})}
      {...(Platform.OS === 'ios' && titleRole
        ? { lineBreakStrategyIOS: 'push-out' }
        : {})}
      style={[
        {
          color: roleColour(tone ?? role.color, colors),
          ...(drawnFamily !== undefined ? { fontFamily: drawnFamily } : {}),
          fontWeight: weight,
          fontSize: role.fontSize * capScale,
          lineHeight: (role.lineHeight + LINE_HEIGHT_NUDGE) * capScale,
          flexShrink: 1,
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
        },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        heightGuard.key === heightKey && heightGuard.minimum > 0
          ? { minHeight: heightGuard.minimum }
          : null,
        style,
        // After the caller's style: its own bottom padding keeps its value
        // and the slack is added to it.
        slack ? { paddingBottom: bottomPadding(style) + slack } : null,
      ]}
    />
  );
}

/** A word-safe header with the native header trait. */
export function Heading({
  level = 2,
  kind = 'record',
  long = false,
  ...props
}: Omit<OpaxTextProps, 'variant'> & {
  level?: 1 | 2 | 3;
  kind?: 'page' | 'record';
  long?: boolean;
}) {
  const variant =
    level === 1
      ? kind === 'page'
        ? 'pageTitle'
        : long || textContent(props.children).length > 80
          ? 'recordHeading'
          : 'recordTitle'
      : level === 2
        ? 'sectionTitle'
        : 'subsectionTitle';
  return (
    <Text wordSafe {...props} variant={variant} accessibilityRole="header" />
  );
}
