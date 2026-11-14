// Release builds carry none of the newcomer design options.
export type NewcomerOption = 'a' | 'b' | 'c';
export function newcomerOption(): NewcomerOption | null {
  return null;
}
export function learnNameIndex(): 0 | 1 | 2 {
  return 0;
}
