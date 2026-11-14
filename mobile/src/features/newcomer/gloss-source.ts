import { provideGloss } from '../../design/gloss';
import { glossaryTerm, isTermId } from '../learn/glossary';
import { openTerm } from '../learn/open-term';
import { useExplainTerms } from '../learn/settings';

/**
 * Hands the design system's plain lines (design/gloss.tsx) their three
 * inputs: the reader's "Explain terms" setting, the guide's one-line meaning
 * of each term (glossary.json `short`, unchanged), and the answer sheet a
 * tap opens. Called once, by the root layout, before anything draws.
 */
export function installGloss() {
  provideGloss({
    useEnabled: useExplainTerms,
    entry: (id) => {
      if (!isTermId(id)) return undefined;
      const term = glossaryTerm(id);
      return { word: term.word, line: term.short };
    },
    open: (id) => {
      if (isTermId(id)) openTerm(id);
    },
  });
}
