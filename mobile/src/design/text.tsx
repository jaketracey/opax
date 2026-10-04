import Constants from 'expo-constants';
import { isValidElement, useRef, useState, type ReactNode } from 'react';
import {
  Text as NativeText,
  useWindowDimensions,
  type TextLayoutEvent,
  type TextProps,
} from 'react-native';
import { useBoldText } from './accessibility';
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
  /** Fixture-only native drawing check for a journey's full-name assertion. */
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
 * The next scale cap after a mid-word break, from the line height in effect
 * (line heights scale with the same Dynamic Type multiplier as the font).
 * Null when the text is already at the reader's default size or below.
 */
export function nextWordSafeCap(
  lineHeight: number,
  baseLineHeight: number,
): number | null {
  const current = Math.round((lineHeight / baseLineHeight) * 100) / 100;
  if (current <= 1.01) return null;
  return Math.max(1, Math.round(current * 90) / 100);
}

type DrawnLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
/** Native TextKit line bounds, not the element's full accessibility label. */
export function drawnTextClipped(
  lines: readonly DrawnLine[],
  frame: { width: number; height: number },
  content: string,
): boolean {
  const normalize = (text: string) => text.replace(/\s/g, '');
  return (
    !lines.length ||
    normalize(lines.map((line) => line.text).join('')) !== normalize(content) ||
    lines.some(
      (line) =>
        line.x < -0.01 ||
        line.y < -0.01 ||
        line.x + line.width > frame.width + 0.01 ||
        line.y + line.height > frame.height + 0.01,
    )
  );
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
  testDrawnText = false,
  onTextLayout,
  onLayout,
  ...props
}: OpaxTextProps) {
  const bold = useBoldText();
  const role = textStyles[variant];
  const tabular = 'tabular' in role && role.tabular;
  const { fontScale, width, scale } = useWindowDimensions();
  // A cap belongs to one text size, width and text (nested text included, such
  // as a field's "(required)"): any change starts again from full size.
  const content = textContent(props.children);
  const key = `${fontScale}|${width}|${content}`;
  const [capped, setCapped] = useState({ key, cap: 0 });
  const cap = capped.key === key ? capped.cap : 0;
  const heightKey = `${key}|${variant}|${bold}|${cap}|${scale}`;
  const diagnose =
    testDrawnText &&
    !!props.testID &&
    Constants.expoConfig?.extra?.variant === 'e2e';
  const measured = useRef<{
    key: string;
    frame?: { width: number; height: number };
    lines?: readonly DrawnLine[];
  }>({ key: heightKey });
  const currentMeasurement = () => {
    if (measured.current.key !== heightKey)
      measured.current = { key: heightKey };
    return measured.current;
  };
  const [drawing, setDrawing] = useState({ key: '', lines: 0, clipped: true });
  const [heightGuard, setHeightGuard] = useState({
    key: '',
    width: 0,
    minimum: 0,
  });
  const guardDrawing = () => {
    const { frame, lines } = measured.current;
    if (!frame || frame.height <= 0 || frame.width <= 0) return;
    // One whole point survives Yoga rounding; a physical pixel may round away.
    // Only the first natural frame sets the minimum, never the guarded frame.
    // Ordinary single-line text needs no extra render. A clipped wrapped
    // paragraph may be reported as one overflowing native line. Avoid even
    // dispatching a no-op update once settled (React may render before bailout).
    if (
      !(heightGuard.key === heightKey && heightGuard.minimum > 0) &&
      (wordSafe ||
        (lines &&
          (lines.length > 1 || drawnTextClipped(lines, frame, content))))
    ) {
      setHeightGuard({
        key: heightKey,
        width: frame.width,
        minimum: Math.ceil(frame.height) + 1,
      });
    }
    if (diagnose && lines) {
      const next = {
        key: heightKey,
        lines: lines.length,
        clipped: drawnTextClipped(lines, frame, content),
      };
      if (
        drawing.key !== next.key ||
        drawing.lines !== next.lines ||
        drawing.clipped !== next.clipped
      )
        setDrawing(next);
    }
  };
  const onLayoutLines = (event: TextLayoutEvent) => {
    onTextLayout?.(event);
    currentMeasurement().lines = event.nativeEvent.lines;
    guardDrawing();
    if (!wordSafe) return;
    const lines = event.nativeEvent.lines;
    if (!lines.length || !breaksMidWord(lines)) return;
    const next = nextWordSafeCap(
      lines[0]!.height,
      role.lineHeight + LINE_HEIGHT_NUDGE,
    );
    if (next !== null) setCapped({ key, cap: next });
  };
  return (
    <NativeText
      // Names and party abbreviations are read with Australian English rules.
      accessibilityLanguage="en-AU"
      {...props}
      testID={
        diagnose && drawing.key === heightKey
          ? `${props.testID}-drawn-${drawing.clipped ? 'clipped' : 'complete'}-${drawing.lines}`
          : props.testID
      }
      onTextLayout={onLayoutLines}
      onLayout={(event) => {
        onLayout?.(event);
        // This event may still include the old floor. Forget that frame and
        // its lines before removing the floor, then wait for a fresh layout.
        if (
          heightGuard.key === heightKey &&
          heightGuard.width !== event.nativeEvent.layout.width
        ) {
          measured.current = { key: heightKey };
          setHeightGuard({
            key: heightKey,
            width: event.nativeEvent.layout.width,
            minimum: 0,
          });
          if (diagnose) setDrawing({ key: '', lines: 0, clipped: true });
          return;
        }
        currentMeasurement().frame = event.nativeEvent.layout;
        guardDrawing();
      }}
      allowFontScaling
      maxFontSizeMultiplier={wordSafe && cap ? cap : 0}
      dynamicTypeRamp={role.dynamicTypeRamp}
      style={[
        {
          color: colors[tone ?? role.color],
          fontFamily: bold ? boldStep[role.fontFamily] : role.fontFamily,
          fontSize: role.fontSize,
          lineHeight: role.lineHeight + LINE_HEIGHT_NUDGE,
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
