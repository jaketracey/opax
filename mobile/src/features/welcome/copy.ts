import type { SFSymbol } from '../../design/icon';
import { symbols } from '../../design/symbols';

/**
 * The welcome's words (DIRECTION 6.2, shell.md 4). The independence line and
 * the cultural notice are `copy.independence` and `copy.deceasedNotice`
 * (design/copy.ts), shared with About. Plain Australian English, no em
 * dashes, no full stops in titles, no example screens.
 */
export interface WelcomeFeature {
  id: 'your-mp' | 'sourced' | 'ask';
  symbol: SFSymbol;
  title: string;
  line: string;
}
export const welcomeCopy = Object.freeze({
  title: 'Welcome to OPAX',
  features: [
    // Plain words for a reader who has never followed politics (newcomer
    // build, README 4.1): no "MP", "declared" or "the record" before they
    // are explained. "Machine-written" stays, as the app labels it.
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
      line: 'Get an answer that links to the records behind it. Machine-written text is always labelled.',
    },
  ] as readonly WelcomeFeature[],
  continue: 'Continue',
  /** Back button title on the seat step. */
  backTitle: 'Welcome',
  seatTitle: 'Your electorate',
});
