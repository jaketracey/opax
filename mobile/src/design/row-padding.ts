import { createContext, useContext, useEffect } from 'react';
import { colors } from './tokens';

/** Marks a row component that draws its own vertical padding in a RowList. */
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
export function useRowHighlight() {
  return useContext(SurfaceContext) === 'sunken'
    ? colors.raised
    : colors.sunken;
}

// The group keeps its text inset; rows bleed their interactive surface to the cell edges.
export const RowCellInsetContext = createContext(0);
export function useRowCellStyle() {
  const inset = useContext(RowCellInsetContext);
  return inset
    ? { marginHorizontal: -inset, paddingHorizontal: inset }
    : undefined;
}
