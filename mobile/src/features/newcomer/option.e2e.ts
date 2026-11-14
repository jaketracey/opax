import { Settings } from 'react-native';

// E2E builds only (metro.config.js swaps in option.production.ts and the
// production block list refuses this file). The newcomer design pass (14 Nov
// 2026) builds three options side by side; Maestro picks one with
// `arguments: { OPAXNewcomer: 'a' | 'b' | 'c' }`. Kept in the app's own
// defaults for later launches, like the welcome tour's argument.
export type NewcomerOption = 'a' | 'b' | 'c';
const kept = 'OPAXNewcomerKept';
let read: NewcomerOption | null | undefined;
export function newcomerOption(): NewcomerOption | null {
  if (read !== undefined) return read;
  try {
    const asked = String(Settings.get('OPAXNewcomer') ?? '');
    const value = ['a', 'b', 'c'].includes(asked)
      ? asked
      : String(Settings.get(kept) ?? '');
    read = ['a', 'b', 'c'].includes(value) ? (value as NewcomerOption) : null;
    if (read) Settings.set({ [kept]: read });
  } catch {
    read = null;
  }
  return read;
}

/**
 * The Learn hub's name on a capture: `OPAXLearnName: '1' | '2' | '3'` picks
 * one of the three names put to Jake (learn/copy.ts). Kept like the option.
 */
const keptName = 'OPAXLearnNameKept';
export function learnNameIndex(): 0 | 1 | 2 {
  try {
    const asked = String(Settings.get('OPAXLearnName') ?? '');
    const value = ['1', '2', '3'].includes(asked)
      ? asked
      : String(Settings.get(keptName) ?? '1');
    if (['1', '2', '3'].includes(asked)) Settings.set({ [keptName]: asked });
    return (['1', '2', '3'].indexOf(value) as 0 | 1 | 2) < 0
      ? 0
      : (['1', '2', '3'].indexOf(value) as 0 | 1 | 2);
  } catch {
    return 0;
  }
}
