import { TwoSlotStore } from '../../storage/two-slot';
import { decodeChoice, type SeatChoice } from './model';
const store = new TwoSlotStore(
  ['opax-seat-v1.json', 'opax-seat-v1.b.json'],
  decodeChoice,
  (choice) => choice,
);
export function loadChoice(): Promise<SeatChoice | null> {
  return store.read();
}
const listeners = new Set<(choice: SeatChoice) => void>();
/** Fired after a complete save only. Disk format and reads stay unchanged. */
export function subscribeChoice(
  listener: (choice: SeatChoice) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function saveChoice(choice: SeatChoice): Promise<void> {
  await store.save(choice);
  listeners.forEach((listener) => listener(choice));
}
