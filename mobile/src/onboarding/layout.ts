import { breakpoints } from '../design/adaptive';
import { isAccessibilityCategory } from '../design/tokens';

/**
 * How the welcome tour lays out (iPad, Oct 2026):
 * - `phone`: compact width (every iPhone; an iPad in Split View, Slide Over
 *   or a narrow Stage Manager window): the paged phone tour.
 * - `columns`: regular width in landscape: the picture beside a column of
 *   words at a readable measure, the actions under the words.
 * - `stacked`: regular width in portrait, a squarer window, or any
 *   accessibility text size: the picture above, the words below in a centred
 *   readable column, the actions pinned at the foot.
 */
export type TourArrangement = 'phone' | 'columns' | 'stacked';

/** Two columns need room for a picture beside about 60 characters a line. */
export const COLUMNS_MIN_WIDTH = 900;

export function tourArrangement({
  regular,
  width,
  height,
  fontScale,
}: {
  regular: boolean;
  width: number;
  height: number;
  fontScale: number;
}): TourArrangement {
  if (!regular) return 'phone';
  if (isAccessibilityCategory(fontScale)) return 'stacked';
  return width > height && width >= COLUMNS_MIN_WIDTH ? 'columns' : 'stacked';
}

/** The words' column in `stacked`: about 70 characters of the iPad lede. */
export const PAD_READABLE = 660;

/** Side margins on iPad, as the app's iPad screens use. */
export function padMargin(width: number) {
  return width >= breakpoints.wide ? 56 : 40;
}

export interface PadGeometry {
  /** The picture's box. */
  stage: { width: number; height: number };
  /** The words' (and, in columns, the actions') column. */
  column: number;
  /** Between the picture and the words in `columns`. */
  gutter: number;
}

/**
 * Sizes inside the tour's body (`width` by `height`, margins already taken
 * off): in columns the picture takes about 55 to 60% of the width and the
 * full height; stacked, the picture takes the upper half or so, less at
 * accessibility sizes, so the title starts on the first screen.
 */
export function padGeometry({
  arrangement,
  width,
  height,
  fontScale,
}: {
  arrangement: Exclude<TourArrangement, 'phone'>;
  width: number;
  height: number;
  fontScale: number;
}): PadGeometry {
  if (arrangement === 'columns') {
    const gutter = Math.round(Math.max(32, Math.min(64, width * 0.05)));
    const column = Math.round(
      Math.max(360, Math.min(620, (width - gutter) * 0.43)),
    );
    return {
      stage: { width: width - gutter - column, height },
      column,
      gutter,
    };
  }
  const large = isAccessibilityCategory(fontScale);
  const share = large ? 0.42 : 0.56;
  const stageHeight = Math.round(
    Math.max(220, Math.min(large ? 420 : 760, height * share)),
  );
  return {
    stage: { width: Math.min(width, 980), height: stageHeight },
    // At accessibility sizes a line holds a few words at any measure: use
    // the width, so long words never meet the column's edge.
    column: Math.min(width, large ? 1100 : PAD_READABLE),
    gutter: 0,
  };
}

/**
 * Where a horizontal swipe over the iPad tour goes: the next page for a
 * swipe to the left, the previous for one to the right, null for a short
 * or slow drag and at either end.
 */
export function swipeTarget(
  dx: number,
  vx: number,
  page: number,
  count: number,
): number | null {
  const far = Math.abs(dx) >= 56;
  const quick = Math.abs(dx) >= 16 && Math.abs(vx) >= 0.35;
  if (!far && !quick) return null;
  const target = page + (dx < 0 ? 1 : -1);
  return target >= 0 && target < count ? target : null;
}
