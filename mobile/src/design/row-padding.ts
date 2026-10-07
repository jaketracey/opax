/** Marks a row component that draws its own vertical padding in a RowList. */
export const ROW_OWNS_PADDING = Symbol.for('opax.rowOwnsPadding');

/** Control rows (LinkRow, Disclosure, PersonRow, web links) own their 44pt. */
export function ownsRowPadding<T extends object>(component: T): T {
  (component as Record<symbol, unknown>)[ROW_OWNS_PADDING] = true;
  return component;
}
