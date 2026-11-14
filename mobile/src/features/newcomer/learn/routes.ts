/** `/learn` and `/learn/[chapter]`: pushed in whichever tab the reader is in. */
export const learnRoute = { pathname: '/learn' as const };
export const learnChapterRoute = (chapter: string) => ({
  pathname: '/learn/[chapter]' as const,
  params: { chapter },
});
