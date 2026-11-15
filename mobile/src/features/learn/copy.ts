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
