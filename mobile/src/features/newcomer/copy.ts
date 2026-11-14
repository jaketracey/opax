import type { TermId } from '../learn/glossary';

/**
 * The newcomer build's words (option C, Jake 14 Nov; design pass README
 * sections 4.1 to 4.4). Plain Australian English: the plain thing first,
 * then its name; typographic apostrophes; no em dashes. The guide's own
 * wording (glossary lines, chapters) lives in content/learn and is never
 * rewritten here.
 */

/** The welcome's one question, over its two answers (README 4.1, 7.2). */
export const welcomeAsk = Object.freeze({
  question: 'New to how Parliament works? The basics take about a minute.',
  basics: 'Show me the basics',
  know: 'I know how Parliament works',
});

/** One idea of "Parliament in a minute": a heading, two sentences, a drawing. */
export interface MinuteIdea {
  id: 'mp' | 'houses' | 'votes' | 'opax';
  title: string;
  body: readonly string[];
}

/**
 * "Parliament in a minute" (README 4.2): four ideas, each building on the
 * last. The figures are the real ones: 150 electorates, 12 senators for each
 * state, 76 in all.
 */
export const minuteIdeas: readonly MinuteIdea[] = [
  {
    id: 'mp',
    title: 'You have an MP',
    body: [
      'Australia is split into 150 areas called electorates. Each one elects one person to speak for it in Canberra.',
      'That person is your MP, short for member of parliament.',
    ],
  },
  {
    id: 'houses',
    title: 'Parliament has two rooms',
    body: [
      'MPs sit in the House of Representatives. Senators sit in the Senate, 12 for each state, so you have a team of those too.',
      'A new law has to win a vote in both rooms.',
    ],
  },
  {
    id: 'votes',
    title: 'They vote for you',
    body: [
      'A proposed law is called a bill. When Parliament votes on one and counts every name, that’s a division.',
      'It’s the clearest record there is of where your MP stands.',
    ],
  },
  {
    id: 'opax',
    title: 'OPAX shows you the record',
    body: [
      'How they voted. What they own and were given. What they’re paid.',
      'Every figure links to its official source, and OPAX takes no side.',
    ],
  },
];

export const minuteCopy = Object.freeze({
  /** The page's title, and its stack title (the seat step's back label). */
  title: 'Parliament in a minute',
  lead: 'Four ideas, and you’ll be able to read everything in OPAX.',
  /** Where the rest lives, said once at the end. */
  more: 'There’s more in “How Parliament works”, any time, from Today.',
  /** The bar button in the welcome: straight on to the electorate step. */
  skip: 'Skip',
  skipLabel: 'Skip the basics',
  /** The welcome's last button. A replay with a seat saved says Continue. */
  find: 'Find my electorate',
  next: 'Continue',
  /** "More" answers after the four ideas: glossary term ids. */
  further: [
    { term: 'government', label: 'Who is the government?' },
    { term: 'crossbench', label: 'What’s the crossbench?' },
  ] as const satisfies readonly { term: TermId; label: string }[],
  /** The drawings' captions (the chamber arcs and the counted vote). */
  house: 'House · 150 MPs',
  senate: 'Senate · 76 senators',
  ayes: 'Said yes (the ayes)',
  noes: 'Said no (the noes)',
  record: {
    votes: 'How they voted',
    interests: 'What they declared',
    pay: 'What they’re paid',
  },
});

/** Step numbers for VoiceOver: "Idea 1 of 4". */
export const ideaLabel = (n: number) => `Idea ${n} of ${minuteIdeas.length}`;
