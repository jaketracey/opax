/**
 * The guide's own screen copy: its name, row titles and buttons. The guide's
 * text itself (chapters, glossary answers) comes from content/learn through
 * content.generated.ts and is never written here.
 */
export const learnCopy = {
  /** Jake, 14 Nov: the guide's name. */
  name: 'How Parliament works',
  lead: 'How laws are made, who does what, and how to read the record, in plain words.',
  glossary: 'A to Z glossary',
  /** Home's first-run card. */
  cardLine: 'Short chapters and an A to Z glossary, in plain words.',
  openGuide: 'Open the guide',
  hideCard: 'Hide How Parliament works',
  minute: 'Parliament in a minute',
  seeIt: 'See it in OPAX',
  next: 'Next',
  back: 'Back to the guide',
  more: 'More',
  /** A link to a chapter the guide does not have (an old link). */
  missingChapter: 'This chapter isn’t in the guide',
  missingChapterBody: 'The link may be old. The guide lists every chapter.',
  /** The hub's mark on a chapter read to its last idea. */
  read: 'Read',
  /** The header over the chapter that follows, on a chapter's last idea. */
  nextChapter: 'Next chapter',
  /** Account › Glossary terms and its switches. */
  termsPage: 'Glossary terms',
  /** The inline tips: a marked word and its short answer (Jake, build 76). */
  underline: 'Glossary tips',
  explain: 'Explain terms',
  switchesFooter:
    'Glossary tips mark a word the guide explains: tap it for a short answer. Explain terms adds a plain line under some headings.',
  /** The answer sheet's last control, and what it says once tapped. */
  hideTips: 'Hide tips',
  tipsHidden:
    'Tips hidden. Turn them back on in Account, under Glossary terms.',
} as const;

/** "Explains division": the VoiceOver hint on text that holds a term. */
export const explainsHint = (word: string) => `Explains ${word}`;
/** The custom action on a row or tile that holds a term. */
export const explainAction = (word: string) => `Explain ${word}`;
/** "How a bill becomes an Act · 2 of 23". */
export const chapterKicker = (title: string, at: number, of: number) =>
  `${title} · ${at} of ${of}`;
/**
 * The hub's words for the reader's place in a chapter: "4 of 23" beside a
 * chapter left part-way (spoken "idea 4 of 23"), "Read" beside one read to
 * its last idea. Nothing for a chapter not opened.
 */
export const chapterPlaceWords = (
  progress: { kind: 'read' } | { kind: 'part'; at: number } | null,
  total: number,
): { value: string; spoken: string } | null =>
  !progress
    ? null
    : progress.kind === 'read'
      ? { value: learnCopy.read, spoken: learnCopy.read }
      : {
          value: `${progress.at} of ${total}`,
          spoken: `idea ${progress.at} of ${total}`,
        };
