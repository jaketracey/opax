import type { TermId } from './content.generated';

/**
 * "How Parliament works" routes. The guide is pushed inside whichever tab
 * the reader is in (the tab bar stays, Back works), so "See it in OPAX" can
 * push a record on the same stack. The answer sheet is a root sheet, like
 * the source and rule sheets, so a term opens over any screen.
 */
export const learnRoute = { pathname: '/learn' as const };
export const learnChapterRoute = (chapter: string, screen?: number) => ({
  pathname: '/learn/[chapter]' as const,
  params: { chapter, ...(screen ? { screen: String(screen) } : {}) },
});
export const glossaryRoute = { pathname: '/learn/glossary' as const };
/** "Parliament in a minute": ad-newcomer-c owns the page. */
export const minuteRoute = { pathname: '/learn/minute' as const };
export const termRoute = (id: TermId, aboveTabs = false) => ({
  pathname: '/term' as const,
  params: { id, ...(aboveTabs ? { over: '1' } : {}) },
});
