import type { SFSymbol } from '../../design/icon';
import { symbols } from '../../design/symbols';

/**
 * The welcome's words (DIRECTION 6.2, shell.md 4). The independence line and
 * the cultural notice are `copy.independence` and `copy.deceasedNotice`
 * (design/copy.ts), shared with About. Plain Australian English, no em
 * dashes, no full stops in titles, no example screens.
 */
export interface WelcomeFeature {
  /** `basics`: the newcomer design pass's fourth row (prototype). */
  id: 'your-mp' | 'sourced' | 'ask' | 'basics';
  symbol: SFSymbol;
  title: string;
  line: string;
}
export const welcomeCopy = Object.freeze({
  title: 'Welcome to OPAX',
  features: [
    {
      id: 'your-mp',
      symbol: symbols.yourMP,
      title: 'Your MP',
      line: 'See who represents you, and what they have voted for, declared and been paid.',
    },
    {
      id: 'sourced',
      symbol: symbols.source,
      title: 'Every figure is sourced',
      line: 'Each number shows its date and opens the original record.',
    },
    {
      id: 'ask',
      symbol: symbols.ask,
      title: 'Ask the record',
      line: 'Answers cite parliamentary records. Machine-written text is always labelled.',
    },
  ] as readonly WelcomeFeature[],
  continue: 'Continue',
  /** Back button title on the seat step. */
  backTitle: 'Welcome',
  seatTitle: 'Your electorate',
});
