import { createContext, useContext, useEffect, useLayoutEffect } from 'react';
import { colors, layout } from './tokens';

/** Marks a row component that draws its own vertical padding in a InsetGroup. */
export const ROW_OWNS_PADDING = Symbol.for('opax.rowOwnsPadding');

/** Control rows (LinkRow, Disclosure, PersonRow, web links) own their 44pt. */
export function ownsRowPadding<T extends object>(component: T): T {
  (component as Record<symbol, unknown>)[ROW_OWNS_PADDING] = true;
  return component;
}

// Containers provide their ground and each row reports its text-column inset.
// Keeping these contexts here avoids a layout -> rows -> layout import cycle.
export const SurfaceContext = createContext<'paper' | 'sunken' | 'raised'>(
  'paper',
);
export const RowInsetContext = createContext<((inset: number) => void) | null>(
  null,
);
export function useRowInset(inset = 16) {
  const report = useContext(RowInsetContext);
  useEffect(() => {
    report?.(inset);
  }, [inset, report]);
}
/**
 * A pressed (or keyboard-highlighted) row's fill: always a different colour
 * from both the row's own surface and the page around it, so the pressed
 * row reads as part of its group's rounded card (which clips it). On a
 * raised group the page is `sunken` (grouped surfaces), so `sunken` there
 * made a pressed row look detached from the card (TestFlight, 13 Nov).
 */
export function useRowHighlight() {
  const surface = useContext(SurfaceContext);
  return surface === 'sunken'
    ? colors.raised
    : surface === 'raised'
      ? colors.dividerSubtle
      : colors.sunken;
}

/**
 * A row in an InsetGroup says while it is the selected split row, so the
 * group clears the separators touching it (as iOS hides a selected cell's).
 * Rows outside a group report to no one.
 */
export const RowSelectedContext = createContext<
  ((selected: boolean) => void) | null
>(null);
export function useRowSelected(selected: boolean) {
  const report = useContext(RowSelectedContext);
  // Before paint, so a row selected on mount never shows its rules first.
  useLayoutEffect(() => {
    if (!report || !selected) return;
    report(true);
    return () => report(false);
  }, [report, selected]);
}

/**
 * The horizontal margin of the column a row sits in, so a split row's
 * selected fill keeps the same gap to the column's edges in every list:
 * Screen's column (16pt in a pane narrower than 414pt, as Search's is) or a
 * list's own `layout.screenMargin` (Bills, the directories), the default.
 */
export const ColumnMarginContext = createContext<number>(layout.screenMargin);

// The group keeps its text inset; rows bleed their interactive surface to the cell edges.
export const RowCellInsetContext = createContext(0);
export function useRowCellStyle() {
  const inset = useContext(RowCellInsetContext);
  return inset
    ? { marginHorizontal: -inset, paddingHorizontal: inset }
    : undefined;
}
