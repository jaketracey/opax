import type { Electorate } from '../../api/catalogs';
import type { SeatChoice } from '../your-mp/model';
import { daysBetween, sydneyDay } from '../today/rules';
import type { District, KeyDate, Overview } from './decoders';
import { vicCopy as c } from './copy';

export const TODAY_UNTIL = '2026-12-05';
export const SEARCH_UNTIL = '2026-12-28';
export const todayWindow = (now: Date) => sydneyDay(now) <= TODAY_UNTIL;
export const searchWindow = (now: Date) => sydneyDay(now) <= SEARCH_UNTIL;
export const phase = (o: Overview, now: Date): 'ahead' | 'today' | 'closed' =>
  now.getTime() >= Date.parse(o.polls_close)
    ? 'closed'
    : sydneyDay(now) === o.election_day
      ? 'today'
      : 'ahead';
export const dayCount = (o: Overview, now: Date) =>
  Math.max(0, daysBetween(sydneyDay(now), o.election_day));
export const keyDateWords = (row: KeyDate, now: Date) =>
  row.passes_at && now.getTime() >= Date.parse(row.passes_at)
    ? {
        label: row.passed_label ?? row.label,
        when: row.passed_when ?? row.when,
      }
    : { label: row.label, when: row.when };
export const decimal = (n: number) => n.toFixed(1);
export const percentage = (n: number) => `${decimal(n)}%`;
export const shareText = (n: number) =>
  n >= 99.95 ? c.all : n < 1 ? c.underOne : `${Math.round(n)}%`;
export const shareSpoken = (n: number) =>
  n >= 99.95 ? c.all : n < 1 ? c.underOneAX : c.perCent(Math.round(n));
export const contestName = (r: { date: string; kind: string }) =>
  c.contest(r.date.slice(0, 4), r.kind);
export const rowFigure = (d: District) =>
  d.result ? c.by(d.result.party, decimal(d.result.margin)) : null;
export function todayEligible(
  choice: SeatChoice | null,
  seats: readonly Electorate[],
  zone: string,
): boolean {
  if (!choice || (!choice.seatId && !choice.stateSeatIds.length))
    return zone === 'Australia/Melbourne';
  const federal = seats.find((s) => s.electorate_id === choice.seatId);
  return (
    federal?.state_code.toLowerCase() === 'vic' ||
    seats.some(
      (s) =>
        choice.stateSeatIds.includes(s.electorate_id) &&
        s.jurisdiction === 'vic',
    )
  );
}
export const savedDistrict = (
  ids: readonly string[],
  seats: readonly Electorate[],
  o: Overview,
) =>
  o.districts.find((d) =>
    seats.some(
      (s) =>
        ids.includes(s.electorate_id) &&
        s.chamber === 'vic_la' &&
        s.url === d.electorate_url,
    ),
  ) ?? null;
export const localMatches = (o: Overview, q: string) => {
  const words = q.trim().toLocaleLowerCase('en-AU');
  return o.districts.filter(
    (d) =>
      d.name.toLocaleLowerCase('en-AU').includes(words) ||
      d.member.name.toLocaleLowerCase('en-AU').includes(words),
  );
};
export const dateWords = (day: string, year = true) =>
  new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(year ? { year: 'numeric' } : {}),
  }).format(new Date(`${day}T12:00:00+11:00`));
export const timeWords = (instant: string) =>
  new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    ...(new Date(instant).getUTCMinutes() ? { minute: '2-digit' } : {}),
    hour12: true,
  })
    .format(new Date(instant))
    .replace(/\s+/g, ' ');
export function todayStatus(o: Overview, now: Date) {
  switch (phase(o, now)) {
    case 'ahead':
      return [
        c.ahead(dateWords(o.election_day, false)),
        c.inDays(dayCount(o, now)),
      ];
    case 'today':
      return [
        c.today,
        c.hours(timeWords(o.polls_open), timeWords(o.polls_close)),
      ];
    case 'closed':
      return [c.closed, c.closedToday(dateWords(o.election_day, false))];
  }
}
