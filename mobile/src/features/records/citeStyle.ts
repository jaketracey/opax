// The citation styles a record offers, in DIRECTION 6.4's order, and the
// style last copied or chosen this session (records.md 3.2). In memory only:
// nothing about citing is saved on the device.
import { useSyncExternalStore } from 'react';
import { recordKind, type RecordLike } from './model';

export type CiteStyleId = 'apa' | 'aglc' | 'bibtex' | 'ris';
export interface CiteStyle {
  id: CiteStyleId;
  label: string;
}
export const citeStyles: readonly CiteStyle[] = [
  { id: 'apa', label: 'APA 7' },
  { id: 'aglc', label: 'AGLC' },
  { id: 'bibtex', label: 'BibTeX' },
  { id: 'ris', label: 'RIS' },
];
/** Bill text has one form, the web's source citation. */
export const sourceStyle = { id: 'source', label: 'Source citation' } as const;

/** AGLC fits Hansard only: speeches and divisions. Bill text has no styles. */
export function stylesFor(record: RecordLike): readonly CiteStyle[] {
  const kind = recordKind(record);
  if (kind === 'bill_text') return [];
  return kind === 'speech' || kind === 'division'
    ? citeStyles
    : citeStyles.filter((style) => style.id !== 'aglc');
}

/** The one note under a style's citation, where a style needs one. */
export const citeNotes: Partial<Record<CiteStyleId | 'source', string>> = {
  aglc: 'Add the page number from the Hansard original.',
  source: 'Use the original bill document for clause and page references.',
};

let last: CiteStyleId | null = null;
const listeners = new Set<() => void>();
export function lastCiteStyle(): CiteStyleId | null {
  return last;
}
export function rememberCiteStyle(style: CiteStyleId) {
  if (last === style) return;
  last = style;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** The session's style, else APA 7, among the styles this record offers. */
export function useCiteStyle(record: RecordLike | null): CiteStyleId {
  const chosen = useSyncExternalStore(subscribe, lastCiteStyle, lastCiteStyle);
  const offered = record ? stylesFor(record) : citeStyles;
  return offered.some((style) => style.id === chosen) && chosen
    ? chosen
    : 'apa';
}
/** Forget the session's choice (tests). */
export function resetCiteStyle() {
  last = null;
}
