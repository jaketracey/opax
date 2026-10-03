import { isValidElement, useState, type ReactNode } from 'react';
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
}

/**
 * Added to every role's line height. React Native measures text, ceils the
 * height to the pixel grid, and TextKit draws into exactly that height. When
 * n lines of the scaled line height land exactly on the grid (24pt subheading
 * at AX5 on a 3x screen: 6 x 62.22 = 373.33), the ceil adds no slack and
 * floating-point noise in the frame can leave the last line "not fitting":
 * TextKit then draws the line before it with the rest of the text, clipped at
 * the edge ("party receipts a"). A thousandth of a point with a prime
 * denominator moves the total off the grid for any realistic line count, so
 * the ceil always leaves room. It is invisible on screen.
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
  ...props
}: OpaxTextProps) {
  const bold = useBoldText();
  const role = textStyles[variant];
  const tabular = 'tabular' in role && role.tabular;
  const { fontScale, width } = useWindowDimensions();
  // A cap belongs to one text size, width and text (nested text included, such
  // as a field's "(required)"): any change starts again from full size.
  const key = `${fontScale}|${width}|${textContent(props.children)}`;
  const [capped, setCapped] = useState({ key, cap: 0 });
  const cap = capped.key === key ? capped.cap : 0;
  const onLayoutLines = (event: TextLayoutEvent) => {
    onTextLayout?.(event);
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
      onTextLayout={wordSafe || onTextLayout ? onLayoutLines : undefined}
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
