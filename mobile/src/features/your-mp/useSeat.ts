import { useEffect, useSyncExternalStore } from 'react';
import type { Electorate } from '../../api/catalogs';
import { catalogs } from '../../api/runtime';
import { thisDevice } from '../../design/device';
import { haptic } from '../../design/haptics';
import {
  forgetChoice,
  loadChoice,
  saveChoice,
  subscribeChoice,
} from './choice-store';
import type { Directory, SeatChoice } from './model';
export type SeatState =
  | { status: 'loading' }
  | { status: 'none' }
  | { status: 'chosen'; choice: SeatChoice }
  | { status: 'error'; message: string };
export interface SeatActions {
  choose(seat: Electorate): Promise<void>;
  chooseState(seat: Electorate, region?: Electorate): Promise<void>;
  removeState(): Promise<void>;
  forget(): Promise<void>;
  retry(): void;
}
let snapshot: SeatState = { status: 'loading' };
// Undefined means the initial read has not answered; null is a saved forget.
let rawChoice: SeatChoice | null | undefined;
let directory: Directory | null = null;
let pending: Promise<void> | null = null;
let removeSubscription: (() => void) | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const victoria = (seat: Electorate) => seat.state_code.toLowerCase() === 'vic';
const house = (seat: Electorate) =>
  seat.jurisdiction === 'federal' && seat.chamber === 'representatives';
/** Read migration only. Legacy choices are not rewritten by a read. */
export function migrateSeatChoice(
  choice: SeatChoice,
  seats: readonly Electorate[],
): SeatChoice | null {
  const seat = seats.find((s) => s.electorate_id === choice.seatId);
  if (!seat) return null;
  if (house(seat))
    return {
      ...choice,
      stateSeatIds: victoria(seat) ? choice.stateSeatIds : [],
    };
  const stateSeatIds =
    seat.jurisdiction === 'vic'
      ? [...new Set([seat.electorate_id, ...choice.stateSeatIds])]
      : choice.stateSeatIds;
  return stateSeatIds.length ? { ...choice, seatId: '', stateSeatIds } : null;
}
function publish(choice: SeatChoice | null) {
  const migrated =
    choice && directory
      ? migrateSeatChoice(choice, directory.electorates.data.electorates)
      : choice;
  snapshot = migrated
    ? { status: 'chosen', choice: migrated }
    : { status: 'none' };
  emit();
}
function initialise() {
  removeSubscription ??= subscribeChoice((choice) => {
    rawChoice = choice;
    // A choice saved after the directory read failed (Today's invitation
    // stays usable) would publish "chosen" with no directory, and screens
    // that need both would wait for good. Read the directory again.
    if (!directory && snapshot.status === 'error') {
      actions.retry();
      return;
    }
    publish(choice);
  });
  pending ??= (async () => {
    try {
      const choice = await loadChoice();
      // A save while the initial read is in flight wins over that read.
      if (rawChoice === undefined) rawChoice = choice;
      directory = await catalogs.directory();
      publish(rawChoice);
    } catch {
      snapshot = {
        status: 'error',
        message: `Your electorate couldn’t be loaded on this ${thisDevice()}.`,
      };
      emit();
    }
  })();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
let saving: Promise<unknown> = Promise.resolve();
function save(change: () => SeatChoice, feedback: boolean): Promise<void> {
  initialise();
  const next = saving.then(async () => {
    await pending;
    await saveChoice(change());
    if (feedback) haptic('success');
  });
  saving = next.catch(() => undefined);
  return next;
}
const actions: SeatActions = {
  forget() {
    const next = saving.then(forgetChoice);
    saving = next.catch(() => undefined);
    return next;
  },
  retry() {
    pending = null;
    snapshot = { status: 'loading' };
    emit();
    initialise();
  },
  choose(seat) {
    if (!house(seat) || seat.status === 'historical')
      return Promise.reject(
        new Error('Choose a current House of Representatives electorate.'),
      );
    return save(
      () => ({
        version: 1,
        seatId: seat.electorate_id,
        stateSeatIds: victoria(seat)
          ? snapshot.status === 'chosen'
            ? snapshot.choice.stateSeatIds
            : []
          : [],
      }),
      true,
    );
  },
  chooseState(seat, region) {
    if (
      seat.jurisdiction !== 'vic' ||
      seat.status === 'historical' ||
      (region && region.jurisdiction !== 'vic')
    )
      return Promise.reject(
        new Error('Choose a current Victorian electorate.'),
      );
    return save(() => {
      const federal = directory?.electorates.data.electorates.find(
        (s) => s.electorate_id === rawChoice?.seatId,
      );
      if (federal && house(federal) && !victoria(federal))
        throw new Error('Choose a Victorian federal electorate first.');
      const old = rawChoice?.stateSeatIds ?? [];
      const replacing = new Set([
        seat.chamber,
        ...(region ? [region.chamber] : []),
      ]);
      const retained = old.filter((id) => {
        const s = directory?.electorates.data.electorates.find(
          (s) => s.electorate_id === id,
        );
        return s && !replacing.has(s.chamber);
      });
      return {
        version: 1,
        seatId: rawChoice?.seatId ?? seat.electorate_id,
        stateSeatIds: [
          ...new Set([
            ...retained,
            seat.electorate_id,
            ...(region ? [region.electorate_id] : []),
          ]),
        ],
      };
    }, true);
  },
  removeState() {
    return save(() => {
      if (!rawChoice) throw new Error('No electorate chosen.');
      const old = directory?.electorates.data.electorates.find(
        (s) => s.electorate_id === rawChoice?.seatId,
      );
      // The released format requires an ID. A state Senate entry keeps the
      // federal invitation when removing a migrated state-only choice.
      const invitation =
        old && !house(old)
          ? directory?.electorates.data.electorates.find(
              (s) =>
                s.jurisdiction === 'federal' &&
                s.chamber === 'senate' &&
                s.state_code === old.state_code,
            )
          : null;
      return {
        ...rawChoice,
        seatId: invitation?.electorate_id ?? rawChoice.seatId,
        stateSeatIds: [],
      };
    }, false);
  },
};
export function useSeat(): SeatState & SeatActions {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  useEffect(initialise, []);
  return { ...state, ...actions };
}
/** Shared directory from useSeat's initial read, with no further request. */
export function savedSeatDirectory(): Directory | null {
  return directory;
}
/** Retains the original seat for the migrated invitation and browse state. */
export function migratedSeat(): Electorate | null {
  return (
    directory?.electorates.data.electorates.find(
      (s) => s.electorate_id === rawChoice?.seatId,
    ) ?? null
  );
}
export function resetSeatForTests(): void {
  removeSubscription?.();
  removeSubscription = null;
  snapshot = { status: 'loading' };
  rawChoice = undefined;
  directory = null;
  pending = null;
  saving = Promise.resolve();
}
