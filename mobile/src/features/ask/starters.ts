/**
 * The day's starters (specs/ask.md 2.9): one reviewed list, one rule, three
 * callers (Ask shows four, Today two, Search three). Interim list until Jake
 * approves the data lane's: no party or member is named, and no entry
 * carries a literal year, so the list never goes stale on 1 January.
 */
export const starterList = [
  'What has parliament said about housing affordability this year?',
  'Which donors disclosed the largest donations in the latest financial year?',
  'How much is a federal backbencher paid?',
  'What has parliament said about the NDIS?',
  'What has parliament said about aged care?',
  'Who has received the most from gambling industry donors?',
  'What did parliament say about the social media minimum age?',
  'What gifts have senators declared this year?',
  'What has parliament said about energy prices?',
  'What has parliament said about the Murray–Darling Basin?',
  'What has parliament said about Aboriginal and Torres Strait Islander health?',
  'Which bills became law most recently?',
  'What has parliament said about the cost of living?',
  'What has parliament said about defence spending?',
] as const;

export const starterRule =
  'Four questions a day, in order, from a reviewed list.';

const DAY = 86_400_000;
const sydneyDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
/** Whole days from 1 January 2026 to `date`, counted on Sydney's calendar. */
export function sydneyDayIndex(date: Date | number): number {
  const [year, month, day] = sydneyDay
    .format(new Date(date))
    .split('-')
    .map(Number);
  return Math.round(
    (Date.UTC(year!, month! - 1, day!) - Date.UTC(2026, 0, 1)) / DAY,
  );
}
/** The day's set: four a day, in order (`starterRule`). */
const DAILY = 4;
/**
 * The first `count` of the Sydney day's starters, wrapping. The day's set
 * steps by four whatever the count, so a caller drawing fewer (a seat
 * starter in one row, Today's two) shows a prefix of the same set, never a
 * different one: two mounts on one day always agree.
 */
export function startersFor(date: Date | number, count: number): string[] {
  const length = starterList.length;
  if (count <= 0) return [];
  const start = (((sydneyDayIndex(date) * DAILY) % length) + length) % length;
  return Array.from(
    { length: Math.min(count, length) },
    (_, i) => starterList[(start + i) % length]!,
  );
}
/** The reader's own member, when a seat is saved. It fills, never sends. */
export function seatStarter(member: string): string {
  return `What has ${member.trim()} said in parliament this year?`;
}
