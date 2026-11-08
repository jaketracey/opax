import { TwoSlotStore } from '../../storage/two-slot';
import { welcomeDeclinedAt as readWelcomeDeclinedAt } from '../../onboarding/state';
import { HIDDEN_DAYS, type InvitationDates } from './order';
import { addDays, sydneyDay, type SydneyDate } from './rules';

/**
 * The invitation's device-only dates, never sent anywhere. The card's own
 * "Not now" (`hiddenUntil`, 30 days) lives here, beside the seat store; the
 * welcome's "Not now" day is written by the welcome with its seen flag
 * (onboarding/state.ts) and read back here, so the two are read together.
 */
interface InvitationFile {
  version: 1;
  hiddenUntil?: SydneyDate;
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const store = new TwoSlotStore<InvitationFile>(
  ['opax-today-invitation-v1.json', 'opax-today-invitation-v1.b.json'],
  (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const { version, hiddenUntil } = raw as Record<string, unknown>;
    if (version !== 1) return null;
    return typeof hiddenUntil === 'string' && DAY.test(hiddenUntil)
      ? { version: 1, hiddenUntil }
      : { version: 1 };
  },
  (value) => value,
);

let override: Partial<InvitationDates> | null = null;
/** E2E captures only (launch-fixture): the dates the launch arguments set. */
export function overrideInvitationDates(dates: Partial<InvitationDates>) {
  override = { ...override, ...dates };
}

/** Both dates; an unreadable file is no date (the invitation shows). */
export async function readInvitationDates(): Promise<InvitationDates> {
  const [file, declined] = await Promise.all([
    store.read().catch(() => null),
    readWelcomeDeclinedAt().catch(() => null),
  ]);
  return {
    hiddenUntil: file?.hiddenUntil ?? null,
    welcomeDeclinedAt: declined,
    ...override,
  };
}

const listeners = new Set<(dates: InvitationDates) => void>();
/** Told after the card's "Not now" is saved. */
export function subscribeInvitation(
  listener: (dates: InvitationDates) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The card's "Not now": hidden for 30 days from today, then it returns. */
export async function hideInvitation(
  today: SydneyDate = sydneyDay(),
): Promise<void> {
  const hiddenUntil = addDays(today, HIDDEN_DAYS);
  await store.save({ version: 1, hiddenUntil });
  if (override) override = { ...override, hiddenUntil };
  const dates = await readInvitationDates();
  listeners.forEach((listener) => listener(dates));
}

/** Tests only. */
export function resetInvitationForTests() {
  override = null;
  listeners.clear();
}
