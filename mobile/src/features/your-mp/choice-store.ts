import { TwoSlotStore } from '../../storage/two-slot';
import { decodeChoice, type SeatChoice } from './model';

type SavedChoice = { choice: SeatChoice | null };
const store = new TwoSlotStore<SavedChoice>(
  ['opax-seat-v1.json', 'opax-seat-v1.b.json'],
  (raw) => {
    if (
      raw &&
      typeof raw === 'object' &&
      (raw as { version?: unknown }).version === 1 &&
      (raw as { forgotten?: unknown }).forgotten === true
    )
      return { choice: null };
    const choice = decodeChoice(raw);
    return choice ? { choice } : null;
  },
  ({ choice }) => choice ?? { version: 1, forgotten: true },
);
export async function loadChoice(): Promise<SeatChoice | null> {
  return (await store.read())?.choice ?? null;
}
const listeners = new Set<(choice: SeatChoice | null) => void>();
/** Fired only after the complete save, including a persisted forget. */
export function subscribeChoice(
  listener: (choice: SeatChoice | null) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function saveChoice(choice: SeatChoice): Promise<void> {
  await store.save({ choice });
  listeners.forEach((listener) => listener(choice));
}
export async function forgetChoice(): Promise<void> {
  await store.save({ choice: null });
  listeners.forEach((listener) => listener(null));
}
