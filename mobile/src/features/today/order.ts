import {
  daysBetween,
  editionTier,
  type EditionTier,
  type SydneyDate,
} from './rules';

/**
 * Today's order (today.md 5.2), decided once per cold launch from what is
 * already on the device, so no block ever moves above content the reader
 * can see. Pure, in Sydney dates.
 *
 * - A, fresh: a saved edition that is fresh today.
 * - B, not fresh: a saved edition that is recent or old, or a saved "no
 *   edition published" answer.
 * - C, nothing saved: first install or cleared data.
 */
export type LaunchCase = 'A' | 'B' | 'C';

/** What the disk held for the edition at launch. */
export type CachedEdition = { date: string } | 'missing' | null;

export function launchCase(
  cachedEdition: CachedEdition,
  today: SydneyDate,
): LaunchCase {
  if (cachedEdition === null) return 'C';
  if (cachedEdition === 'missing') return 'B';
  return editionTier(cachedEdition.date, today) === 'fresh' ? 'A' : 'B';
}

/** The invitation's two device-only dates (features/today/invitation-store). */
export interface InvitationDates {
  /** "Not now" from the card's menu: hidden until this day (30 days on). */
  hiddenUntil: SydneyDate | null;
  /** "Not now" in the welcome: after Bills for 7 days from this day. */
  welcomeDeclinedAt: SydneyDate | null;
}

/** Days the invitation sits after Bills following a welcome "Not now". */
export const MOVED_DAYS = 7;
/** Days the card's own "Not now" hides it. */
export const HIDDEN_DAYS = 30;

export type InvitationPlace = 'lead' | 'after-bills' | 'hidden';
/**
 * Where the invitation goes when no seat is saved: hidden while the card's
 * 30-day "Not now" runs (it wins over everything); after Bills from the day
 * of a welcome "Not now" to day 7; otherwise its own slot.
 */
export function invitationPlace(
  dates: InvitationDates,
  today: SydneyDate,
): InvitationPlace {
  if (dates.hiddenUntil && daysBetween(today, dates.hiddenUntil) > 0)
    return 'hidden';
  if (dates.welcomeDeclinedAt) {
    const since = daysBetween(dates.welcomeDeclinedAt, today);
    if (since >= 0 && since <= MOVED_DAYS) return 'after-bills';
  }
  return 'lead';
}

export type TodaySlot =
  | 'vic-election'
  | 'your-mp'
  | 'invitation'
  | 'edition'
  | 'pair'
  | 'following'
  | 'bills'
  | 'votes'
  | 'declarations'
  | 'edition-late'
  | 'more'
  | 'ask'
  | 'foot';

export interface TodayOrder {
  launchCase: LaunchCase;
  slots: TodaySlot[];
  /** Case A: the daily pair opens More to explore, under its header. */
  pairInMore: boolean;
}

/**
 * The page's slots, top to bottom. "Following", "How parliament voted" and
 * "Ask" are listed always; each draws only when it has something (follows,
 * the D1 file, the reviewed starters), and an absent block takes no space.
 */
export function todayOrder({
  seat,
  invitation,
  launchCase: kase,
  today,
}: {
  seat: boolean;
  invitation: InvitationDates;
  launchCase: LaunchCase;
  today: SydneyDate;
}): TodayOrder {
  const place = seat ? null : invitationPlace(invitation, today);
  const lead: TodaySlot[] = seat
    ? ['your-mp']
    : place === 'lead'
      ? ['invitation']
      : [];
  const top: TodaySlot[] =
    kase === 'A'
      ? seat
        ? ['your-mp', 'edition']
        : ['edition', ...lead]
      : kase === 'B'
        ? [...lead, 'pair']
        : [...lead, 'edition', 'pair'];
  const slots: TodaySlot[] = [
    ...top,
    'following',
    'bills',
    ...(place === 'after-bills' ? (['invitation'] as const) : []),
    'votes',
    'declarations',
    ...(kase === 'A' ? [] : (['edition-late'] as const)),
    'more',
    'ask',
    'foot',
  ];
  slots.splice(1, 0, 'vic-election');
  return { launchCase: kase, slots, pairInMore: kase === 'A' };
}

/**
 * Whether the edition draws in a slot, given the launch case and the tier
 * of the edition as it now stands (null: not answered, missing or failed).
 *
 * - The top slot in case A keeps the edition for the session (it was fresh
 *   at launch); in case C it draws only a fresh answer (a skeleton until the
 *   read answers, then it collapses).
 * - The late slot draws a recent edition, and in case B a fresh one that
 *   arrived during the session. Old editions never draw on Today.
 */
export function editionInSlot(
  slot: 'edition' | 'edition-late',
  kase: LaunchCase,
  tier: EditionTier | null,
): boolean {
  if (!tier || tier === 'old') return false;
  if (slot === 'edition') return kase === 'A' || tier === 'fresh';
  if (kase === 'A') return false;
  return tier === 'recent' || (kase === 'B' && tier === 'fresh');
}

/**
 * iPad regular width (today.md 5.16): the same slots in two columns, 3:2.
 * Leading: the edition, Bills, How parliament voted, Just declared and a
 * recent edition at the foot. Trailing: Your MP or the invitation, Following,
 * the daily pair, More to explore and Ask; in cases B and C the pair sits
 * at the top of the trailing column under the lead block.
 */
export function todayColumns(order: TodayOrder): {
  leading: TodaySlot[];
  trailing: TodaySlot[];
} {
  const leadingSet = new Set<TodaySlot>([
    'edition',
    'bills',
    'votes',
    'declarations',
    'edition-late',
  ]);
  const body = order.slots.filter((slot) => slot !== 'foot');
  const trailing = body.filter(
    (slot) => !leadingSet.has(slot) && slot !== 'vic-election',
  );
  const lead = trailing.findIndex(
    (slot) => slot === 'your-mp' || slot === 'invitation',
  );
  const insertion = lead >= 0 ? lead + 1 : order.slots[0] === 'pair' ? 1 : 0;
  trailing.splice(insertion, 0, 'vic-election');
  return {
    leading: body.filter((slot) => leadingSet.has(slot)),
    trailing,
  };
}
