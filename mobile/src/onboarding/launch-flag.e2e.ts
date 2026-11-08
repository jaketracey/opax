import { Settings } from 'react-native';

// E2E builds only (metro.config.js swaps in launch-flag.production.ts and the
// production block list refuses this file). Maestro passes
// `arguments: { OPAXWelcomeTour: 'on' }` as `-OPAXWelcomeTour on` (the alias
// `OPAXWelcome` is accepted too), which iOS puts in NSUserDefaults' argument
// domain. A launch from a link (`openLink` on a stopped app) carries no
// arguments, so the first launch's choice is kept in the app's own defaults
// for that launch; `clearState` removes it with the rest of the app's data.
const kept = 'OPAXWelcomeTourKept';
export function e2eTourRequested(): boolean {
  try {
    const asked = ['OPAXWelcomeTour', 'OPAXWelcome'].some(
      (key) => String(Settings.get(key) ?? '') === 'on',
    );
    if (asked) {
      Settings.set({ [kept]: 'on' });
      return true;
    }
    return String(Settings.get(kept) ?? '') === 'on';
  } catch {
    return false;
  }
}
