import { provideGloss } from '../../design/gloss';
import { openTerm, stubGlossary, useExplainTerms } from './foundation-stub';

/**
 * Hands the design system's plain lines (design/gloss.tsx) their three
 * inputs: the reader's "Explain terms" setting, the guide's one-line meaning
 * of each term, and the answer sheet a tap opens. Called once, by the root
 * layout, before anything draws.
 */
export function installGloss() {
  provideGloss({
    useEnabled: useExplainTerms,
    entry: (id) => {
      const term = stubGlossary[id];
      return term ? { word: term.word, line: term.short } : undefined;
    },
    open: openTerm,
  });
}
