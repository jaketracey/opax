import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';

/**
 * A small model of Yoga's row layout, for checking that a label beside
 * something else keeps whole words. Jest has no text layout, so text widths
 * are estimated from SF Pro's coarse advance widths (as controls.tsx does for
 * segment labels). It models what the label rows use: `flex`, `flexGrow`,
 * `flexShrink`, `flexBasis`, `maxWidth` (points or a percentage), padding,
 * `gap`/`columnGap` and `flexWrap`. RN's default `flexShrink` is 0.
 */

const narrowGlyphs = new Set("ijlI.,:;'’!|()");
const slimGlyphs = new Set('frt1');
const wideGlyphs = new Set('mwMW@%');
/** Estimated advance of `text` at `fontSize`; bold runs about 5% wider. */
export function textWidth(text: string, fontSize: number, bold = false) {
  let em = 0;
  for (const glyph of text) {
    if (narrowGlyphs.has(glyph)) em += 0.27;
    else if (glyph === ' ') em += 0.26;
    else if (slimGlyphs.has(glyph)) em += 0.37;
    else if (wideGlyphs.has(glyph)) em += 0.85;
    else if (glyph !== glyph.toLowerCase()) em += 0.66;
    else em += 0.57;
  }
  return em * fontSize * (bold ? 1.05 : 1);
}

const isBold = (weight: unknown) =>
  typeof weight === 'string' && (weight === 'bold' || Number(weight) >= 600);

/** The host nodes directly under `node`, through any composite layers. */
export function hostChildren(node: ReactTestInstance): ReactTestInstance[] {
  return node.children.flatMap((child) =>
    typeof child === 'string'
      ? []
      : typeof child.type === 'string'
        ? [child]
        : hostChildren(child),
  );
}

/** All the string content under a node. */
export function textOf(node: ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('');
}

const styleOf = (node: ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;
const num = (value: unknown) => (typeof value === 'number' ? value : 0);
const horizontalPadding = (style: Record<string, unknown>) =>
  num(style.paddingLeft ?? style.paddingHorizontal ?? style.padding) +
  num(style.paddingRight ?? style.paddingHorizontal ?? style.padding);

/** A text run in the row: its words must each fit its line width. */
export interface Run {
  text: string;
  /** The widest single word, in points. */
  word: number;
  /** The width the run is given, after layout. */
  width: number;
}

/**
 * A node's width before flexing: its text's single-line width, or its
 * children's (side by side in a row, the widest in a column), with padding.
 * `sizes` supplies widths for native hosts the test renderer cannot know
 * (a SwiftUI pop-up button), by testID.
 */
function natural(
  node: ReactTestInstance,
  sizes: Record<string, number>,
): number {
  const id = node.props.testID as string | undefined;
  if (id && sizes[id] !== undefined) return sizes[id]!;
  const style = styleOf(node);
  if ((node.type as unknown) === 'Text') {
    const size = num(style.fontSize) || 17;
    return textWidth(textOf(node), size, isBold(style.fontWeight));
  }
  const kids = hostChildren(node).filter(
    (kid) => styleOf(kid).position !== 'absolute',
  );
  const row = String(style.flexDirection ?? 'column').startsWith('row');
  const gap = num(style.columnGap ?? style.gap);
  const widths = kids.map((kid) => natural(kid, sizes));
  const inner = row
    ? widths.reduce((sum, w) => sum + w, 0) + gap * Math.max(0, kids.length - 1)
    : Math.max(0, ...widths);
  return inner + horizontalPadding(style);
}

/** Text runs inside a node laid out `width` wide (columns pass it down). */
function runs(node: ReactTestInstance, width: number): Run[] {
  const style = styleOf(node);
  if ((node.type as unknown) === 'Text') {
    const text = textOf(node);
    const size = num(style.fontSize) || 17;
    const bold = isBold(style.fontWeight);
    const word = Math.max(
      0,
      ...text.split(/\s+/).map((w) => textWidth(w, size, bold)),
    );
    return [{ text, word, width }];
  }
  const inner = width - horizontalPadding(style);
  const row = String(style.flexDirection ?? 'column').startsWith('row');
  if (row) return layoutRow(node, inner, {}).runs;
  return hostChildren(node).flatMap((kid) => runs(kid, inner));
}

/**
 * Lays out a row host node `width` wide, as Yoga would for these styles:
 * hypothetical sizes from `flexBasis` (or the content), clamped by
 * `maxWidth`; lines broken greedily when the row wraps; free space shared
 * by `flexGrow`, overflow taken by `flexShrink` weighted by size.
 */
export function layoutRow(
  row: ReactTestInstance,
  width: number,
  sizes: Record<string, number>,
): { lines: number; widths: number[]; runs: Run[] } {
  const style = styleOf(row);
  const wrap = style.flexWrap === 'wrap';
  const gap = num(style.columnGap ?? style.gap);
  const kids = hostChildren(row).filter(
    (kid) => styleOf(kid).position !== 'absolute',
  );
  const items = kids.map((kid) => {
    const s = styleOf(kid);
    const flex = num(s.flex);
    const grow = flex > 0 ? flex : num(s.flexGrow);
    const shrink = flex > 0 ? 1 : num(s.flexShrink);
    const basis =
      flex > 0 ? 0 : typeof s.flexBasis === 'number' ? s.flexBasis : null;
    const max =
      typeof s.maxWidth === 'number'
        ? s.maxWidth
        : typeof s.maxWidth === 'string' && s.maxWidth.endsWith('%')
          ? (width * parseFloat(s.maxWidth)) / 100
          : Infinity;
    const content = natural(kid, sizes);
    const hypothetical = Math.min(basis ?? Math.min(content, width), max);
    return { kid, grow, shrink, max, hypothetical, size: hypothetical };
  });
  const lines: (typeof items)[] = [];
  for (const item of items) {
    const line = lines.at(-1);
    const used = line
      ? line.reduce((sum, i) => sum + i.hypothetical, 0) + gap * line.length
      : 0;
    if (!line || (wrap && used + item.hypothetical > width)) lines.push([item]);
    else line.push(item);
  }
  for (const line of lines) {
    const used =
      line.reduce((sum, i) => sum + i.hypothetical, 0) +
      gap * (line.length - 1);
    const free = width - used;
    if (free > 0) {
      const grow = line.reduce((sum, i) => sum + i.grow, 0);
      for (const item of line)
        if (grow > 0)
          item.size = Math.min(
            item.max,
            item.hypothetical + (free * item.grow) / grow,
          );
    } else if (free < 0) {
      const weight = line.reduce(
        (sum, i) => sum + i.shrink * i.hypothetical,
        0,
      );
      for (const item of line)
        if (weight > 0)
          item.size = Math.max(
            0,
            item.hypothetical +
              (free * item.shrink * item.hypothetical) / weight,
          );
    }
  }
  return {
    lines: lines.length,
    widths: items.map((item) => item.size),
    runs: items.flatMap((item) => runs(item.kid, item.size)),
  };
}

/** Runs whose widest word does not fit the width they were given. */
export function brokenWords(result: { runs: Run[] }): string[] {
  return result.runs
    .filter((run) => run.word > run.width + 0.5)
    .map(
      (run) =>
        `${run.text} (${Math.round(run.word)}pt word in ${Math.round(run.width)}pt)`,
    );
}
