// Journey 15's drawn-first-line rule, kept pure so tests can pin it against
// recognised text from real captures. scripts/first-line-check.ts runs it on
// screenshots after the journey.

/** One recognised line, in image pixels from the top left. */
export interface OcrLine {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Ocr {
  width: number;
  height: number;
  lines: OcrLine[];
}
export interface FirstLineVerdict {
  pass: boolean;
  reason: string;
  title?: OcrLine;
  prefix?: OcrLine;
  tabLabel?: OcrLine;
}

export const TITLE = 'Today';
export const PREFIX = 'OPAX is';
const bottom = (line: OcrLine) => line.top + line.height;
const letters = (text: string) => text.replace(/[^\p{L}]/gu, '');

/**
 * Today's independence line must be drawn starting "OPAX is", wholly below
 * the large title and above the tab bar. Build 2 kept the sentence in the
 * accessibility tree while a cold launch drew its first line behind the
 * title, so the check reads the pixels, not the hierarchy.
 */
export function firstLineVerdict(ocr: Ocr): FirstLineVerdict {
  const titles = ocr.lines.filter((line) => letters(line.text) === TITLE);
  // The large title is the tallest "Today" in the top half; the tab bar's
  // label is a smaller "Today" at the bottom.
  const title = titles
    .filter((line) => line.top < ocr.height / 2)
    .sort((a, b) => b.height - a.height)[0];
  if (!title)
    return {
      pass: false,
      reason: `No large "${TITLE}" title is drawn in the top half`,
    };
  const tabLabel = titles
    .filter((line) => line !== title && line.top > bottom(title))
    .sort((a, b) => b.top - a.top)[0];
  const prefix = ocr.lines
    // Vision can transcribe the drawn Latin A as Cyrillic А at AX5.
    // Maestro still asserts the app's exact ASCII sentence; accept only this
    // observed glyph equivalent here, with every geometry check unchanged.
    .filter((line) =>
      line.text
        .trim()
        .replace(/\u0410/g, 'A')
        .startsWith(PREFIX),
    )
    .sort((a, b) => a.top - b.top)[0];
  const found = { title, tabLabel, prefix };
  if (!prefix)
    return {
      pass: false,
      reason: `No drawn line starts "${PREFIX}": the first line is hidden or missing`,
      ...found,
    };
  if (prefix.top <= bottom(title))
    return {
      pass: false,
      reason: `"${PREFIX}" starts at ${Math.round(prefix.top)}px, inside the title, which ends at ${Math.round(bottom(title))}px`,
      ...found,
    };
  if (
    bottom(prefix) > ocr.height ||
    (tabLabel && bottom(prefix) >= tabLabel.top)
  )
    return {
      pass: false,
      reason: `"${PREFIX}" runs past the visible content area`,
      ...found,
    };
  return {
    pass: true,
    reason: `"${PREFIX}" is drawn ${Math.round(prefix.top - bottom(title))}px below the title`,
    ...found,
  };
}
