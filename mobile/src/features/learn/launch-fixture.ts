import { Settings } from 'react-native';
import { isE2E } from '../../design/environment';
import type { LearnSettings } from './settings';

/**
 * E2E captures only: the guide's launch arguments, read from the argument
 * domain Maestro's `arguments:` fill on iOS. Release builds resolve
 * launch-fixture.production.ts (metro.config.js) and read nothing.
 *
 * - `OPAXLearnCard`: `show` draws Home's first-run guide card (e2e builds
 *   treat the welcome as seen, so the card would otherwise never show).
 * - `OPAXTerms`: `explain` turns Explain terms on; `off` turns the
 *   underline off.
 */
export function learnFixture(): Partial<LearnSettings> | null {
  if (!isE2E) return null;
  const arg = (key: string) => {
    try {
      const value = Settings.get(key);
      return typeof value === 'string' ? value : null;
    } catch {
      return null;
    }
  };
  const fixture: Partial<LearnSettings> = {};
  if (arg('OPAXLearnCard') === 'show') fixture.card = 'show';
  const terms = arg('OPAXTerms');
  if (terms === 'explain') fixture.explain = true;
  if (terms === 'off') fixture.underline = false;
  return Object.keys(fixture).length ? fixture : null;
}
