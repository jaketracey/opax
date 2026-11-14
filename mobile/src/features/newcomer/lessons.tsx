import type { ReactNode } from 'react';
import { ChambersArt, DivisionArt, ElectorateArt, RecordArt } from './art';

/**
 * The basics, in four steps (newcomer design pass; prototype). Option A
 * draws them as four cards; option C as one page. Each is one idea, one
 * drawing and at most three sentences: under a minute to read in all.
 */
export interface Lesson {
  id: 'mp' | 'rooms' | 'votes' | 'opax';
  title: string;
  body: readonly string[];
  art: (large: boolean, width: number) => ReactNode;
}

export const lessons: readonly Lesson[] = [
  {
    id: 'mp',
    title: 'You have an MP',
    body: [
      'Australia is split into 150 areas called electorates. Each one elects one person to speak for it in Canberra.',
      'That person is your MP, short for member of parliament.',
    ],
    art: (large) => <ElectorateArt height={large ? 110 : 150} />,
  },
  {
    id: 'rooms',
    title: 'Parliament has two rooms',
    body: [
      'MPs sit in the House of Representatives. Senators sit in the Senate, 12 for each state, so you have a team of those too.',
      'A new law has to win a vote in both rooms.',
    ],
    art: (large, width) => (
      <ChambersArt
        stacked={large}
        size={large ? Math.min(200, width) : Math.min(150, (width - 16) / 2)}
      />
    ),
  },
  {
    id: 'votes',
    title: 'They vote for you',
    body: [
      'A proposed law is called a bill. When Parliament votes on one and counts every name, that’s a division.',
      'It’s the clearest record there is of where your MP stands.',
    ],
    art: (_, width) => <DivisionArt width={Math.min(280, width)} />,
  },
  {
    id: 'opax',
    title: 'OPAX shows you the record',
    body: [
      'How they voted. What they own and were given. What they’re paid.',
      'Every figure links to its official source, and OPAX takes no side.',
    ],
    art: () => <RecordArt />,
  },
];

export const lessonCopy = {
  /** Option A's bar button: straight to the electorate step. */
  skip: 'Skip',
  next: 'Next',
  /** The last card's button, and option C's. */
  find: 'Find my electorate',
  step: (n: number) => `${n} of ${lessons.length}`,
  /** Option C's page title. */
  pageTitle: 'Parliament in a minute',
  pageLead: 'Four ideas, and you’ll be able to read everything in OPAX.',
  /** Bar title for both, so the seat step's back button names them. */
  barTitle: 'The basics',
} as const;
