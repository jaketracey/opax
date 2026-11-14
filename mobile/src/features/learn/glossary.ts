import {
  glossaryTerms,
  learnChapters,
  learnExamples,
  termIds,
  type TermId,
} from './content.generated';
import type { LearnTerm } from './content-types';

export { learnChapters, learnExamples, termIds, type TermId };

const byId = new Map<string, LearnTerm<TermId>>(
  glossaryTerms.map((term) => [term.id, term]),
);

export function isTermId(value: unknown): value is TermId {
  return typeof value === 'string' && byId.has(value);
}

/** One glossary entry by id; every id in `termIds` has one. */
export function glossaryTerm(id: TermId): LearnTerm<TermId> {
  return byId.get(id)!;
}

/**
 * The term as a title: the guide writes common nouns in lower case ("bill",
 * "first reading") so they read inside a sentence; a sheet or an A to Z row
 * starts with a capital.
 */
export function termTitle(id: TermId): string {
  const { word } = glossaryTerm(id);
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Folded for sorting and search: case, accents and apostrophes ignored. */
export function foldTerm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, '')
    .toLowerCase();
}

/** Every term, A to Z by its title. */
export const termsAtoZ: readonly TermId[] = [...termIds].sort((a, b) =>
  foldTerm(termTitle(a)).localeCompare(foldTerm(termTitle(b)), 'en-AU'),
);

/** The chapter a term is taught in (its "Read more in" row). */
export function termChapter(id: TermId) {
  return learnChapters.find(
    (chapter) => chapter.slug === glossaryTerm(id).chapter,
  );
}
