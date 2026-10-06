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
export function saveChoice(choice: SeatChoice): Promise<void> {
  return store.save(choice);
}
