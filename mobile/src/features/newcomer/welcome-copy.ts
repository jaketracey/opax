import { symbols } from '../../design/symbols';
import type { WelcomeFeature } from '../welcome/copy';
import type { NewcomerOption } from './option';

/**
 * The welcome page's words in each option (newcomer design pass; prototype).
 * The three shared rows drop every term a newcomer may not know: no "MP",
 * no "declared", no "the record", no "machine-written".
 */
const plain: readonly WelcomeFeature[] = [
  {
    id: 'your-mp',
    symbol: symbols.yourMP,
    title: 'Who speaks for you',
    line: 'Find the person elected to represent your area, and see how they vote.',
  },
  {
    id: 'sourced',
    symbol: symbols.source,
    title: 'Every figure is sourced',
    line: 'Each number shows its date and opens the official record it came from.',
  },
  {
    id: 'ask',
    symbol: symbols.ask,
    title: 'Ask in your own words',
    line: 'Get an answer that links to the records behind it. Computer-written text is always labelled.',
  },
];

export interface NewcomerWelcome {
  features: readonly WelcomeFeature[];
  /** A line over the buttons (option C's question). */
  ask?: string;
  primary: string;
  /** Where the primary button goes. */
  primaryTo: 'tour' | 'basics' | 'seat';
  /** A second, plain button that goes straight to the electorate step. */
  secondary?: string;
}

export const newcomerWelcome: Record<NewcomerOption, NewcomerWelcome> = {
  // A: everyone is offered the four cards; one tap skips them.
  a: {
    features: [
      ...plain,
      {
        id: 'basics',
        symbol: symbols.help,
        title: 'New to politics?',
        line: 'The next four cards cover the basics in about a minute.',
      },
    ],
    primary: 'Continue',
    primaryTo: 'tour',
    secondary: 'Skip the basics',
  },
  // B: no lesson. The promise is that help is beside every term.
  b: {
    features: [
      ...plain,
      {
        id: 'basics',
        symbol: symbols.help,
        title: 'Plain words, any time',
        line: 'Tap the question mark beside a term like MP or division for a short answer.',
      },
    ],
    primary: 'Continue',
    primaryTo: 'seat',
  },
  // C: the reader says which they are, once.
  c: {
    features: plain,
    ask: 'New to how Parliament works? The basics take about a minute.',
    primary: 'Show me the basics',
    primaryTo: 'basics',
    secondary: 'I know how Parliament works',
  },
};
