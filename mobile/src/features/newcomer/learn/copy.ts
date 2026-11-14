import type { SFSymbol } from '../../../design/icon';
import { symbols } from '../../../design/symbols';
import type { Accent } from '../../../design/tokens';
import { learnNameIndex } from '../option';

/**
 * The Learn hub's words (newcomer design pass; prototype).
 *
 * The guide's own text is being written in another lane. Only ONE line here
 * is guide copy (`realLine`, supplied by the orchestrator). Every other
 * chapter page is marked as a placeholder on screen, so no frame can be
 * mistaken for finished content, and nothing here states a fact of its own.
 */

/** Three names put to Jake; a capture picks one with `OPAXLearnName`. */
export const learnNames = [
  'How Parliament works',
  'The basics',
  'Politics 101',
] as const;
export const learnName = () => learnNames[learnNameIndex()];

export const realLine =
  'A bill is a proposed law. It becomes an Act when both houses pass it and the Governor-General signs it.';

export interface LearnPage {
  /** The one idea, as a heading. */
  idea: string;
  body: string;
  placeholder: boolean;
  /** A drawing or component for the idea. */
  art?: 'tracker';
}
export interface LearnChapter {
  id: 'bills' | 'who' | 'votes' | 'money' | 'elections' | 'federal';
  title: string;
  /** What the chapter covers, on the hub. A label, not guide copy. */
  line: string;
  symbol: SFSymbol;
  ink: Accent | 'navy';
  pages: readonly LearnPage[];
  /** "See it in OPAX": where the chapter ends, on a real record. */
  see: {
    label: string;
    line: string;
    to: 'bill' | 'division' | 'person' | 'money';
  };
}

const placeholder = (n: number): LearnPage => ({
  idea: `Idea ${n}`,
  body: 'Placeholder. One idea goes here in two or three short sentences, written for the guide.',
  placeholder: true,
});

export const chapters: readonly LearnChapter[] = [
  {
    id: 'bills',
    title: 'How a bill becomes an Act',
    line: 'From an idea to a law, step by step',
    symbol: symbols.bills,
    ink: 'bills',
    pages: [
      {
        idea: 'A bill is a proposed law',
        body: realLine,
        placeholder: false,
        art: 'tracker',
      },
      placeholder(2),
      placeholder(3),
    ],
    see: {
      label: 'Follow a real bill',
      line: 'Open a bill that has been through these steps and see each one dated.',
      to: 'bill',
    },
  },
  {
    id: 'who',
    title: 'Who’s who',
    line: 'MPs, senators, ministers and parties',
    symbol: symbols.party,
    ink: 'navy',
    pages: [placeholder(1), placeholder(2)],
    see: {
      label: 'Meet a real MP',
      line: 'Open a profile and see the role, the party and the electorate.',
      to: 'person',
    },
  },
  {
    id: 'votes',
    title: 'How votes work',
    line: 'Divisions, ayes and noes',
    symbol: symbols.vote,
    ink: 'votes',
    pages: [placeholder(1), placeholder(2)],
    see: {
      label: 'See a real division',
      line: 'Open a vote and see who said yes and who said no.',
      to: 'division',
    },
  },
  {
    id: 'money',
    title: 'Money and interests',
    line: 'Donations, pay and what politicians must declare',
    symbol: symbols.money,
    ink: 'money',
    pages: [placeholder(1), placeholder(2)],
    see: {
      label: 'See the money',
      line: 'Open the money map and follow who gave what to which party.',
      to: 'money',
    },
  },
  {
    id: 'elections',
    title: 'Elections',
    line: 'How your vote is counted',
    symbol: symbols.electorate,
    ink: 'navy',
    pages: [placeholder(1), placeholder(2)],
    see: {
      label: 'See a real result',
      line: 'Open an electorate and see how its last election went.',
      to: 'person',
    },
  },
  {
    id: 'federal',
    title: 'Federal and state',
    line: 'Which parliament does what',
    symbol: symbols.yourMP,
    ink: 'navy',
    pages: [placeholder(1), placeholder(2)],
    see: {
      label: 'See both of yours',
      line: 'Open Your MP and see who represents you at each level.',
      to: 'person',
    },
  },
];

export const learnCopy = {
  lead: 'A plain guide to how Australian politics works. One idea at a time.',
  chapters: 'Chapters',
  glossary: 'A to Z glossary',
  glossaryLine: 'Every term OPAX uses, in a sentence or two',
  minute: 'Parliament in a minute',
  minuteLine: 'The four ideas to start with',
  next: 'Next',
  done: 'Back to the guide',
  seeIt: 'See it in OPAX',
  placeholder: 'Placeholder',
  step: (n: number, of: number) => `${n} of ${of}`,
  /** Today's first-run card. */
  cardLine:
    'A plain guide to how it all works, one idea at a time. Start with how a bill becomes law.',
  cardOpen: 'Open the guide',
  cardHide: 'Hide',
} as const;
