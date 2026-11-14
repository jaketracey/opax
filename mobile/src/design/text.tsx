import {
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Text as NativeText,
  Platform,
  useWindowDimensions,
  type TextLayoutEvent,
  type TextProps,
} from 'react-native';
import { useBoldText, useHighTextContrast } from './accessibility';
import { spokenFigures } from './format';
import { lightHighContrast, paletteFor } from './palette';
import { bindRecordTitle, recordTitleRoles } from './record-title';
import { useTextProbe } from './text-probe';
import type { ProbeLine } from './text-probe.types';
import { androidCapScale, textRampScale } from './text-scale';
import {
  boldStep,
  colors,
  contentSizeCategory,
  textStyles,
  type Role,
  type TextVariant,
} from './tokens';

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
   * its longest word needs, with an 11pt floor.
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
 * A role's colour. iOS resolves Increase Contrast natively; Android's High
 * contrast text takes the same stronger roles (`lightHighContrast`).
 */
export function roleColour(tone: Role | 'link', strong: boolean) {
  const role = tone === 'link' ? 'navy' : tone;
  return strong
    ? (lightHighContrast[role] ?? paletteFor('light')[role])
    : colors[role];
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
 * the final frame below that measurement; the separate height guard below
 * covers that shortfall. Neither protection replaces the other.
 */
export const LINE_HEIGHT_NUDGE = 1 / 997;

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
});
/** Two-place rounding of the line height leaves this much noise. */
const MEASURED_AT_TOLERANCE = 0.03;
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
 * and only for this text. The cap only steps down, in 10% steps, after a
 * mid-word break measured at the size now drawn. At any reader text size it
 * may step below the role's default size, to `floor` (wordSafeFloor), when a
 * word is still wider than its column (a layout from a larger size delivered
 * late included). The first measurement must
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
  if (
    state.cap &&
    state.frame &&
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
  if (breaksMidWord(lines)) {
    const next = nextWordSafeCap(lineHeight, baseLineHeight, floor);
    if (next === null || (state.cap && next >= state.cap)) return state;
    return {
      ...state,
      gen: state.gen + 1,
      cap: next,
      // Native conversion validates the ramp when available. Otherwise this
      // first matching frame/content pair supplies the measured baseline.
      full: state.cap ? state.full : measuredAt,
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
  const highContrast = useHighTextContrast();
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
  const guardDrawing = () => {
    const { frame, lines, verified } = measured.current;
    if (!frame || frame.height <= 0 || frame.width <= 0) return;
    // The height floor repairs TextKit rounding on iOS. Android measures its
    // own glyph bounds; adding a floor there re-lays out every mounted Text.
    if (Platform.OS === 'android') {
      if (probe.enabled) probe.update(lines, frame);
      return;
    }
    // One whole point survives Yoga rounding; a physical pixel may round away.
    // Queued onLayout events carry no identity or font scale. After a new
    // heightKey, only measure() of the committed, unguarded view may set the
    // floor. On first mount there is no previous identity to queue a frame.
    // A guarded frame must never add another point to an established floor.
    // Guard every content Text, including a completely missing first line:
    // RN suppresses the initial empty onTextLayout event. A frame callback is
    // independent of its glyphs. Avoid dispatching no-op updates once settled.
    if (
      verified &&
      !(heightGuard.key === heightKey && heightGuard.minimum > 0)
    ) {
      setHeightGuard({
        key: heightKey,
        width: frame.width,
        minimum: Math.ceil(frame.height) + 1,
      });
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
    currentMeasurement().lines = event.nativeEvent.lines;
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
    if (!wordSafe && (Platform.OS === 'android' || measurement.initial)) return;
    // Text/content can change without changing the frame, suppressing onLayout.
    // Measure every iOS Text after an identity change, including plain text:
    // its new floor must use the current native size, never a queued frame.
    // Its callback is cancelled when another identity/step commits.
    let active = true;
    nativeText.current?.measure((_x, _y, width, height) => {
      if (active) frameReceiver.current({ width, height }, true);
    });
    return () => {
      active = false;
    };
  }, [heightKey, wordSafe]);
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
          color: roleColour(tone ?? role.color, highContrast),
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
