import { TwoSlotStore } from '../../storage/two-slot';

/**
 * What Today's lead looked like the last time the directory answered, kept
 * on the device so the next launch lays the page out before the directory
 * does: whether the saved choice is a House seat (Your representatives
 * lead), whether the state member's row draws in the group and whether the
 * senators row does, so the group has its final height on the first frame.
 * The saved choice alone cannot
 * say: a choice kept from 1.0 may name a Senate or a state seat, which the
 * read migration sets aside only once the directory is in. `key` ties the
 * answer to the choice it was made for. Device-only, never sent anywhere.
 */
export interface TodayShape {
  /** The saved choice this answer is for (`shapeKey`). */
  key: string;
  /** Your MP leads the page. */
  house: boolean;
  /** The state member's row draws in the representatives group. */
  state: boolean;
  /** The senators link row draws in the representatives group. */
  senators: boolean;
}
/**
 * Version 2: `state` is the state member's row (version 1 kept the old
 * state seat card, withheld for Victorian seats), and `senators` is new. A
 * version 1 file is not read; the page predicts from the saved choice.
 */
interface ShapeFile extends TodayShape {
  version: 2;
}

const store = new TwoSlotStore<ShapeFile>(
  ['opax-today-shape-v1.json', 'opax-today-shape-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, key, house, state, senators } = raw as Record<
      string,
      unknown
    >;
    return version === 2 &&
      typeof key === 'string' &&
      typeof house === 'boolean' &&
      typeof state === 'boolean' &&
      typeof senators === 'boolean'
      ? { version: 2, key, house, state, senators }
      : null;
  },
  (value) => value,
);

/** The saved choice as a key: its seat and its state seats, as saved. */
export function shapeKey(
  choice: { seatId: string; stateSeatIds: readonly string[] } | null,
): string {
  return choice ? `${choice.seatId}|${choice.stateSeatIds.join(',')}` : '';
}

/** The last shape kept, or null (a first launch, or an unreadable file). */
export async function readTodayShape(): Promise<TodayShape | null> {
  const file = await store.read().catch(() => null);
  return file
    ? {
        key: file.key,
        house: file.house,
        state: file.state,
        senators: file.senators,
      }
    : null;
}

/** Keeps the shape the directory answered; a failed save changes nothing. */
export async function rememberTodayShape(shape: TodayShape): Promise<void> {
  await store.save({ version: 2, ...shape }).catch(() => undefined);
}
