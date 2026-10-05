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
 * A word-safe text's cap. `key` is the text size, window width, role, weight
 * and text it belongs to; `full` is the uncapped multiplier, measured at the
 * first mid-word break. `lineWidth` and `slack` record the column it broke
 * in: its widest line then, and one line height.
 */
export interface WordSafeCap {
  key: string;
  cap: number;
  full: number;
  lineWidth: number;
  slack: number;
}
export const fullSize = (key: string): WordSafeCap => ({
  key,
  cap: 0,
  full: 0,
  lineWidth: 0,
  slack: 0,
});
/** Two-place rounding of the line height leaves this much noise. */
const MEASURED_AT_TOLERANCE = 0.03;

/**
 * The cap after one layout of a word-safe text. It only steps down, in 10%
 * steps, after a mid-word break, and only from a layout measured at the size
 * now drawn: an older layout delivered late (full size after a cap, or a
 * capped one after a reset) can neither raise nor lower it. Returns
 * `previous` itself when nothing changes, so React skips the update.
 */
export function wordSafeAfterLayout(
  previous: WordSafeCap,
  key: string,
  lines: readonly { text: string; width: number; height: number }[],
  baseLineHeight: number,
): WordSafeCap {
  if (!lines.length) return previous;
  const state = previous.key === key ? previous : fullSize(key);
  const measuredAt = lineScale(lines[0]!.height, baseLineHeight);
  const drawnAt = state.cap || state.full;
  if (drawnAt && Math.abs(measuredAt - drawnAt) > MEASURED_AT_TOLERANCE)
    return previous;
  if (!breaksMidWord(lines)) return previous;
  const next = nextWordSafeCap(lines[0]!.height, baseLineHeight);
  if (next === null || (state.cap && next >= state.cap)) return previous;
  return {
    key,
    cap: next,
    full: state.full || measuredAt,
    lineWidth:
      state.lineWidth ||
      Math.max(
        0,
        ...lines.map((line) => (Number.isFinite(line.width) ? line.width : 0)),
      ),
    slack: state.slack || lines[0]!.height,
  };
}

/**
 * The cap after the text's frame changes width. A char-wrapped line fills
 * its column to within one glyph, and a smaller font never draws wider than
 * that column, so a frame wider than the widest line at the break plus one
 * line height means the column itself grew: start again from full size,
 * keeping the measured uncapped multiplier. Narrower frames keep the cap; a
 * mid-word break in a narrower column steps it down as usual.
 */
export function wordSafeAfterResize(
  previous: WordSafeCap,
  key: string,
  frameWidth: number,
): WordSafeCap {
  // Without measured line widths there is no column to compare against.
  if (previous.key !== key || !previous.cap || !previous.lineWidth)
    return previous;
  if (frameWidth <= previous.lineWidth + previous.slack) return previous;
  return { ...fullSize(key), full: previous.full };
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
  // again from full size, and so does a wider column (onLayout below).
  const content = textContent(props.children);
  const key = `${fontScale}|${width}|${variant}|${bold}|${content}`;
  const [capped, setCapped] = useState(() => fullSize(key));
  const { cap, full } = capped.key === key ? capped : fullSize(key);
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
    setCapped((previous) =>
      wordSafeAfterLayout(
        previous,
        key,
        lines,
        role.lineHeight + LINE_HEIGHT_NUDGE,
      ),
    );
  };
  return (
    <NativeText
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
          setCapped((previous) =>
            wordSafeAfterResize(previous, key, frame.width),
          );
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
