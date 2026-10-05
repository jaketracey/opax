import { Settings } from 'react-native';

// E2E builds only (metro.config.js swaps in launch-flag.production.ts and the
// production block list refuses this file). Maestro passes
// `arguments: { OPAXWelcomeTour: 'on' }` as `-OPAXWelcomeTour on`, which iOS
// puts in NSUserDefaults' argument domain.
export function e2eTourRequested(): boolean {
  try {
    return String(Settings.get('OPAXWelcomeTour') ?? '') === 'on';
  } catch {
    return false;
  }
}
