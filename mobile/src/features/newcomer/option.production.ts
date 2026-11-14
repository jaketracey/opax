// Release builds carry none of the newcomer design options.
export type NewcomerOption = 'a' | 'b' | 'c';
export function newcomerOption(): NewcomerOption | null {
  return null;
}
