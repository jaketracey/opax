import { useSyncExternalStore } from 'react';
import { presentSheet } from '../../navigation/sheets';
import type { Block, Inline } from './answer-markdown';

/**
 * Which citation `/citation` shows, and the answer sentence it highlights
 * (journeys/ask.md 4.6). The sheet is undimmed at half height, so a mark or
 * a Records cited row tapped while it is open re-targets it in place rather
 * than stacking a second sheet.
 */
export type CitationSelection = {
  /** `turnKey(chat, index)` of the answer. */
  turn: string;
  /** The source's number in the answer, 1-based. */
  n: number;
  /** The claim: the block and sentence the tapped mark closes. */
  claim?: { block: string; sentence: number };
};
let selection: CitationSelection | null = null;
let open = false;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function citationSelection() {
  return selection;
}
export function useCitationSelection() {
  return useSyncExternalStore(subscribe, citationSelection, citationSelection);
}
/** Opens `/citation` on a source, or moves the open sheet to it. */
export function showCitation(next: CitationSelection) {
  selection = next;
  publish();
  if (!open) {
    open = true;
    presentSheet({
      kind: 'citation',
      citation: { number: next.n },
      testID: 'citation-sheet',
    });
  }
}
/** Previous and Next in the sheet's bar: the claim follows the source's first mark. */
export function moveCitation(n: number, claim?: CitationSelection['claim']) {
  if (!selection) return;
  selection = { ...selection, n, claim };
  publish();
}
/** The sheet calls these as it mounts and leaves; leaving clears the highlight. */
export function citationSheetMounted() {
  open = true;
}
export function citationSheetLeft() {
  open = false;
  selection = null;
  publish();
}
/**
 * Where source `n` is first cited in the answer: the block key (as
 * `AnswerBody` registers it) and the sentence its mark closes. Previous and
 * Next move the highlight there.
 */
export function firstClaim(
  blocks: readonly Block[],
  n: number,
): CitationSelection['claim'] {
  const find = (spans: readonly Inline[], key: string) => {
    const mark = spans.find(
      (span) => span.kind === 'cite' && span.numbers.includes(n),
    );
    return mark ? { block: key, sentence: mark.sentence } : undefined;
  };
  for (const [index, block] of blocks.entries()) {
    const key = String(index);
    let found: CitationSelection['claim'];
    switch (block.kind) {
      case 'paragraph':
      case 'heading':
      case 'quote':
        found = find(block.spans, key);
        break;
      case 'bullets':
      case 'numbered':
        for (const [i, item] of block.items.entries())
          found ??= find(item, `${key}.${i}`);
        break;
      case 'table':
        for (const [c, cell] of block.header.entries())
          found ??= find(cell, `${key}.h${c}`);
        for (const [r, row] of block.rows.entries())
          for (const [c, cell] of row.entries())
            found ??= find(cell, `${key}.${r}.${c}`);
        break;
    }
    if (found) return found;
  }
  return undefined;
}
/** The iPad pane's selection: the claim is highlighted, no sheet opens. */
export function selectCitation(next: CitationSelection | null) {
  selection = next;
  publish();
}
