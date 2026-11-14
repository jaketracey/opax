import type { Electorate } from '../../api/catalogs';
import type { SeatChoice } from '../your-mp/model';
import { daysBetween, sydneyDay } from '../today/rules';
import type {
  Contest,
  District,
  KeyDate,
  Overview,
  SeatDetail,
} from './decoders';
import { vicCopy as c } from './copy';
import {
  decodeElectionState,
  electionStates,
  VIC_ELECTION_EARLY_OPEN,
  VIC_ELECTION_EARLY_CLOSE,
  VIC_ELECTION_POLLS_OPEN,
  VIC_ELECTION_POLLS_CLOSE,
  type ElectionState,
} from './state';

export const TODAY_UNTIL = '2026-12-05';
export const SEARCH_UNTIL = '2026-12-28';
export const todayWindow = (now: Date) => sydneyDay(now) <= TODAY_UNTIL;
export const searchWindow = (now: Date) => sydneyDay(now) <= SEARCH_UNTIL;
export type ElectionContext = {
  state?: ElectionState;
  current_results?: Overview['current_results'];
  current_result?: Contest;
};
export function electionState(o: ElectionContext, now: Date): ElectionState {
  const time = now.getTime();
  const derived =
    time >= Date.parse(VIC_ELECTION_POLLS_CLOSE)
      ? 'polls_closed'
      : time >= Date.parse(VIC_ELECTION_POLLS_OPEN)
        ? 'election_day'
        : time >= Date.parse(VIC_ELECTION_EARLY_OPEN)
          ? 'early_voting'
          : 'pre_poll';
  const published = decodeElectionState(o.state);
  // A cached pre-close state expires at its next boundary. A server may
  // advance the page, but must never keep voting open after polling close.
  const api =
    published &&
    electionStates.indexOf(published) >= electionStates.indexOf(derived)
      ? published
      : undefined;
  const state = api ?? derived;
  const hasResults =
    !!o.current_results?.districts.length || !!o.current_result;
  if (
    state === 'polls_closed' ||
    state === 'results' ||
    state === 'results_final'
  ) {
    if (!hasResults) return 'polls_closed';
    return o.current_results
      ? o.current_results.status === 'final'
        ? 'results_final'
        : 'results'
      : state === 'results_final'
        ? 'results_final'
        : 'results';
  }
  return state;
}
export const phase = (
  o: ElectionContext,
  now: Date,
): 'ahead' | 'today' | 'closed' => {
  const state = electionState(o, now);
  return state === 'pre_poll' || state === 'early_voting'
    ? 'ahead'
    : state === 'election_day'
      ? 'today'
      : 'closed';
};
export const seatContext = (s: SeatDetail, o?: Overview): ElectionContext => ({
  state: s.state ?? o?.state,
  current_results: o?.current_results,
  current_result:
    s.current_result ??
    o?.current_results?.districts.find((d) => d.name === s.name)?.result,
});
export function electionCopy(o: ElectionContext, now: Date, awaiting = false) {
  const state = electionState(o, now);
  const closed = phase(o, now) === 'closed';
  const heading =
    state === 'pre_poll'
      ? c.beforeVoting
      : state === 'early_voting'
        ? c.early
        : state === 'election_day'
          ? c.today
          : state === 'results_final'
            ? c.finalResults
            : state === 'results'
              ? c.currentResults
              : c.closed;
  const body =
    state === 'pre_poll'
      ? c.prePollBody
      : state === 'early_voting'
        ? now.getTime() >= Date.parse(VIC_ELECTION_EARLY_CLOSE)
          ? c.earlyClosedBody
          : c.earlyBody
        : state === 'election_day'
          ? now.getTime() < Date.parse(VIC_ELECTION_POLLS_OPEN)
            ? c.votingLater
            : c.votingOpen
          : c.votingClosed +
            ' ' +
            (awaiting
              ? c.awaitingDistrict
              : state === 'results_final'
                ? c.finalResultsBody
                : state === 'results'
                  ? c.resultsBody
                  : c.countingBody);
  return {
    state,
    closed,
    heading,
    body,
    title:
      c.title +
      (state === 'results_final'
        ? ': final lower house results'
        : state === 'results'
          ? ': results'
          : closed
            ? ': polls closed'
            : ''),
  };
}
export const dayCount = (o: Overview, now: Date) =>
  Math.max(0, daysBetween(sydneyDay(now), o.election_day));
export const keyDateWords = (row: KeyDate, now: Date) =>
  row.id === 'early' && now.getTime() >= Date.parse(VIC_ELECTION_EARLY_CLOSE)
    ? { label: c.earlyClosed, when: '6 pm Friday 27 November 2026' }
    : row.passes_at && now.getTime() >= Date.parse(row.passes_at)
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
export function todayStatus(o: Overview, now: Date) {
  const copy = electionCopy(o, now);
  switch (copy.state) {
    case 'pre_poll':
      return [
        c.ahead(dateWords(o.election_day, false)),
        c.inDays(dayCount(o, now)),
      ];
    default:
      return [copy.heading, copy.body];
  }
}
