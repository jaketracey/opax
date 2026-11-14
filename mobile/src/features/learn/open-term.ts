import { router } from 'expo-router';
import { sheetAboveTabs } from '../../navigation/sheets';
import { isTermId, type TermId } from './glossary';
import { termRoute } from './routes';

export type { TermId };

/**
 * Opens a glossary term's answer sheet: the term, the guide's answer, "See
 * it in OPAX" where the guide names a record, then the A to Z glossary. The
 * one way every lane opens a term (the inline `<Term>`, option C's plain
 * lines, the bill tracker's steps). An unknown id opens nothing.
 */
export function openTerm(termId: TermId): void {
  if (!isTermId(termId)) return;
  router.push(termRoute(termId, sheetAboveTabs()));
}
