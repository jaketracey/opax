import { TwoSlotStore } from '../../storage/two-slot';
import type { KeptStateRow } from './dissolution';
import type { RepsWords, RepWords } from './RepsGroup';

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
  /**
   * The state row's form as last decided, with its lines when it is not a
   * member's row, so the next launch holds a row of the same height and
   * can answer while the election record is out. Null with no state row.
   */
  stateRow: KeptStateRow | null;
  /**
   * The words the member rows drew (name, party and role), so the next
   * launch's held rows wrap as the rows will at every text size. Null when
   * the page did not lead with the group, or from a file kept before this.
   */
  members: RepsWords | null;
  /** The election record was withdrawn: it is not asked for again. */
  withdrawn: boolean;
  /**
   * The election `stateRow` and `withdrawn` were decided for (its day), or
   * null when none was known. Once the data names another election, the
   * kept decisions no longer stand, so a new election is decided afresh.
   */
  electionDay: string | null;
}
/**
 * Version 5: `state` is the state row in the group (version 1 kept the old
 * state seat card, withheld for Victorian seats); `senators`, `stateRow`,
 * `withdrawn` and `electionDay` are new. An older file is not read; the page predicts
 * from the saved choice.
 */
interface ShapeFile extends TodayShape {
  version: 5;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const linesOf = (raw: unknown, count: number): readonly string[] | null =>
  Array.isArray(raw) &&
  raw.length === count &&
  raw.every((line) => typeof line === 'string' && line.length <= 200)
    ? (raw as string[])
    : null;
function decodeStateRow(raw: unknown): KeptStateRow | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== 'object') return undefined;
  const row = raw as Record<string, unknown>;
  if (row.kind === 'member')
    return row.until === null || typeof row.until === 'string'
      ? { kind: 'member', until: row.until }
      : undefined;
  if (row.kind === 'dissolved') {
    const lines = linesOf(row.lines, 4);
    return lines &&
      typeof row.electionDay === 'string' &&
      DAY.test(row.electionDay)
      ? { kind: 'dissolved', electionDay: row.electionDay, lines }
      : undefined;
  }
  if (row.kind === 'neutral') {
    const lines = linesOf(row.lines, 3);
    return lines ? { kind: 'neutral', lines } : undefined;
  }
  return undefined;
}

const STATUSES = ['current', 'former', 'unknown'];
function decodeWords(raw: unknown): RepWords | null {
  if (!raw || typeof raw !== 'object') return null;
  const { name, party, partyStatus, role } = raw as Record<string, unknown>;
  const short = (v: unknown): v is string =>
    typeof v === 'string' && v.length <= 200;
  return short(name) &&
    (party === null || short(party)) &&
    typeof partyStatus === 'string' &&
    STATUSES.includes(partyStatus) &&
    short(role)
    ? { name, party, partyStatus: partyStatus as RepWords['partyStatus'], role }
    : null;
}
/** The kept words; an unreadable row holds words of a usual length. */
function decodeMembers(raw: unknown): RepsWords | null {
  if (!raw || typeof raw !== 'object') return null;
  const { federal, state } = raw as Record<string, unknown>;
  return { federal: decodeWords(federal), state: decodeWords(state) };
}

const store = new TwoSlotStore<ShapeFile>(
  ['opax-today-shape-v1.json', 'opax-today-shape-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, key, house, state, senators, withdrawn, electionDay } =
      raw as Record<string, unknown>;
    const stateRow = decodeStateRow((raw as { stateRow?: unknown }).stateRow);
    return version === 5 &&
      typeof key === 'string' &&
      typeof house === 'boolean' &&
      typeof state === 'boolean' &&
      typeof senators === 'boolean' &&
      typeof withdrawn === 'boolean' &&
      (electionDay === null ||
        (typeof electionDay === 'string' && DAY.test(electionDay))) &&
      stateRow !== undefined
      ? {
          version: 5,
          key,
          house,
          state,
          senators,
          stateRow,
          members: decodeMembers((raw as { members?: unknown }).members),
          withdrawn,
          electionDay,
        }
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
        stateRow: file.stateRow,
        members: file.members,
        withdrawn: file.withdrawn,
        electionDay: file.electionDay,
      }
    : null;
}

/** Keeps the shape the directory answered; a failed save changes nothing. */
export async function rememberTodayShape(shape: TodayShape): Promise<void> {
  await store.save({ version: 5, ...shape }).catch(() => undefined);
}
