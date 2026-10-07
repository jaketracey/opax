import {
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Text as NativeText,
  useWindowDimensions,
  type TextLayoutEvent,
  type TextProps,
} from 'react-native';
import { useBoldText } from './accessibility';
import { useTextProbe } from './text-probe';
import type { ProbeLine } from './text-probe.types';
import {
  boldStep,
  colors,
  textStyles,
  type Role,
  type TextVariant,
} from './tokens';

export type TextTone = Extract<
  Role,
  | 'ink'
  | 'inkSoft'
  | 'inkFaint'
  | 'bronzeInk'
  | 'danger'
  | 'navy'
  | 'onNavy'
  | 'onNavySoft'
  | 'moneyInk'
  | 'votesInk'
  | 'interestsInk'
  | 'billsInk'
>;
export interface OpaxTextProps extends TextProps {
  variant?: TextVariant;
  /**
   * Override the role's colour. `inkFaint` is for paper and raised surfaces
   * only; on sunken surfaces and tags use `inkSoft`.
   */
  tone?: TextTone;
  /**
   * Never break a word across lines. React Native has no hyphenation on iOS,
   * so at large text sizes this text steps its own scale down, only as far as
   * its longest word needs and never below the reader's default size.
   * Headings, control labels and field labels use it.
   */
  wordSafe?: boolean;
  /**
   * Native drawing check enabled in e2e. Production resolves a no-op module
   * and excludes the diagnostic implementation and its prop factory.
   */
  testDrawnText?: boolean;
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
 * The next scale cap after a mid-word break, from the line height in effect.
 * Null when the text is already at the reader's default size or below.
 */
export function nextWordSafeCap(
  lineHeight: number,
  baseLineHeight: number,
): number | null {
  const current = lineScale(lineHeight, baseLineHeight);
  if (current <= 1.01) return null;
  return Math.max(1, Math.round(current * 90) / 100);
}

/**
 * A word-safe text's state for one identity: text size, window width, role,
 * weight and text. Every change of cap starts a new generation, drawn by a
 * new native Text (its React key), so each layout event names the instance
 * that measured it: Fabric delivers a late event to the props of the
 * instance that emitted it, never to its replacement's.
 */
export interface WordSafeState {
  key: string;
  gen: number;
  /** The cap on the Dynamic Type multiplier; 0 is full size. */
  cap: number;
  /** The uncapped multiplier, from this identity's first full-size break. */
  full: number;
  /** The full-size generation, and the frame width it was laid out in. */
  fullGen: number;
  fullFrame: number;
  /** The capped instance's frame width, and its longest unbreakable run of
   * text scaled to full size (an upper bound: its widest line). */
  frame: number;
  word: number;
}
/** The native instance an event came from. */
export interface WordSafeInstance {
  key: string;
  gen: number;
}
export const wordSafeStart = (key: string, gen = 0): WordSafeState => ({
  key,
  gen,
  cap: 0,
  full: 0,
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
/** Full size again, as a new generation; the uncapped multiplier still holds. */
const restart = (state: WordSafeState): WordSafeState => ({
  ...wordSafeStart(state.key, state.gen + 1),
  full: state.full,
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
 * The state after one line measurement. Only the instance now drawn counts,
 * and only for this text. The cap only steps down, in 10% steps, after a
 * mid-word break measured at the size now drawn, and never at or below the
 * reader's default size, where there is nothing to step down to (a layout
 * from a larger size delivered late included). `full` comes only from a
 * fresh full-size break. Returns `state` itself when nothing changes.
 */
export function wordSafeOnLines(
  state: WordSafeState,
  at: WordSafeInstance,
  lines: readonly { text: string; width: number; height: number }[],
  content: string,
  baseLineHeight: number,
  fontScale: number,
): WordSafeState {
  if (at.key !== state.key || at.gen !== state.gen || !lines.length)
    return state;
  if (fontScale <= 1) return state;
  if (compact(lines.map((line) => line.text).join('')) !== compact(content))
    return state;
  const measuredAt = lineScale(lines[0]!.height, baseLineHeight);
  const drawnAt = state.cap || state.full;
  if (drawnAt && Math.abs(measuredAt - drawnAt) > MEASURED_AT_TOLERANCE)
    return state;
  if (breaksMidWord(lines)) {
    const next = nextWordSafeCap(lines[0]!.height, baseLineHeight);
    if (next === null || (state.cap && next >= state.cap)) return state;
    return {
      ...state,
      gen: state.gen + 1,
      cap: next,
      full: state.full || measuredAt,
      frame: 0,
      word: 0,
    };
  }
  if (!state.cap) return state;
  // No run breaks at this cap, so each lies within one line.
  const widest = Math.max(
    ...lines.map((line) =>
      Number.isFinite(line.width) ? line.width : Infinity,
    ),
  );
  const word = (widest * state.full) / measuredAt;
  return provenToFit(state.word === word ? state : { ...state, word });
}

/**
 * The state after a frame. A capped instance draws one font and one text, so
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
  wordSafe = false,
  onTextLayout,
  onLayout,
  ...props
}: OpaxTextProps) {
  const bold = useBoldText();
  const role = textStyles[variant];
  const tabular = 'tabular' in role && role.tabular;
  const { fontScale, width, scale } = useWindowDimensions();
  // A cap belongs to one text size, window width, role, weight and text
  // (nested text included, such as a field's "(required)"): any change starts
  // again from full size, and so does a wider column (wordSafeOnFrame).
  const content = textContent(props.children);
  const key = `${fontScale}|${width}|${variant}|${bold}|${content}`;
  // The state machine runs at event time in a ref, so frames and lines that
  // change nothing drawn never render; `shown` re-renders on a new generation.
  const [shown, setShown] = useState(() => wordSafeStart(key));
  const machine = useRef(shown);
  const committedKey = useRef(key);
  useLayoutEffect(() => {
    committedKey.current = key;
  });
  const drawn = shown.key === key ? shown : wordSafeStart(key);
  const { cap, full } = drawn;
  const instance: WordSafeInstance = { key: drawn.key, gen: drawn.gen };
  const advance = (step: (state: WordSafeState) => WordSafeState) => {
    // An event from an instance of an earlier identity, delivered late.
    if (instance.key !== committedKey.current) return;
    if (machine.current.key !== instance.key) {
      const earlier = machine.current;
      machine.current = wordSafeStart(instance.key);
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
  const capScale = wordSafe && cap && full ? cap / full : 1;
  const heightKey = `${key}|${cap}|${scale}`;
  const probe = useTextProbe(props, heightKey, content);
  const measured = useRef<{
    key: string;
    frame?: { width: number; height: number };
    lines?: readonly ProbeLine[];
  }>({ key: heightKey });
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
      if (measured.current.key === heightKey)
        measured.current.frame = { width, height };
      setHeightGuard((previous) =>
        previous.key === heightKey &&
        previous.width === heightGuard.width &&
        previous.minimum === 0
          ? {
              key: heightKey,
              width: heightGuard.width,
              minimum: Math.ceil(height) + 1,
            }
          : previous,
      );
    });
    return () => {
      active = false;
    };
  }, [heightGuard, heightKey]);
  const guardDrawing = () => {
    const { frame, lines } = measured.current;
    if (!frame || frame.height <= 0 || frame.width <= 0) return;
    // One whole point survives Yoga rounding; a physical pixel may round away.
    // Only the first natural frame sets the minimum, never the guarded frame.
    // Guard every content Text, including a completely missing first line:
    // RN suppresses the initial empty onTextLayout event. A frame callback is
    // independent of its glyphs. Avoid dispatching no-op updates once settled.
    if (!(heightGuard.key === heightKey && heightGuard.minimum > 0)) {
      setHeightGuard({
        key: heightKey,
        width: frame.width,
        minimum: Math.ceil(frame.height) + 1,
      });
    }
    probe.update(lines, frame);
  };
  const onLayoutLines = (event: TextLayoutEvent) => {
    onTextLayout?.(event);
    currentMeasurement().lines = event.nativeEvent.lines;
    guardDrawing();
    if (!wordSafe) return;
    const lines = event.nativeEvent.lines;
    advance((state) =>
      wordSafeOnLines(
        state,
        instance,
        lines,
        content,
        role.lineHeight + LINE_HEIGHT_NUDGE,
        fontScale,
      ),
    );
  };
  return (
    <NativeText
      // One native instance per generation (see WordSafeState).
      key={wordSafe ? `${drawn.key}|${drawn.gen}` : undefined}
      // Names and party abbreviations are read with Australian English rules.
      accessibilityLanguage="en-AU"
      {...probe.props}
      ref={nativeText}
      onTextLayout={
        wordSafe || probe.enabled || onTextLayout ? onLayoutLines : undefined
      }
      onLayout={(event) => {
        onLayout?.(event);
        const frame = event.nativeEvent.layout;
        if (frame.width <= 0 || frame.height <= 0) return;
        if (wordSafe)
          advance((state) => wordSafeOnFrame(state, instance, frame.width));
        // This event may still include the old floor. Forget that frame and
        // its lines before removing the floor, then wait for a fresh layout.
        if (
          heightGuard.key === heightKey &&
          Math.abs(heightGuard.width - frame.width) > 0.01
        ) {
          measured.current = { key: heightKey };
          setHeightGuard({
            key: heightKey,
            width: frame.width,
            minimum: 0,
          });
          probe.reset();
          return;
        }
        currentMeasurement().frame = frame;
        guardDrawing();
      }}
      allowFontScaling
      maxFontSizeMultiplier={0}
      dynamicTypeRamp={role.dynamicTypeRamp}
      style={[
        {
          color: colors[tone ?? role.color],
          fontFamily: bold ? boldStep[role.fontFamily] : role.fontFamily,
          fontSize: role.fontSize * capScale,
          lineHeight: (role.lineHeight + LINE_HEIGHT_NUDGE) * capScale,
          flexShrink: 1,
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

const headingVariant = { 1: 'title', 2: 'heading', 3: 'subheading' } as const;
/**
 * A header for VoiceOver's rotor: level 1 page title, 2 section, 3
 * subsection. Word-safe, so a long word never splits at AX5.
 */
export function Heading({
  level = 2,
  ...props
}: Omit<OpaxTextProps, 'variant'> & { level?: 1 | 2 | 3 }) {
  return (
    <Text
      wordSafe
      {...props}
      variant={headingVariant[level]}
      accessibilityRole="header"
    />
  );
}
