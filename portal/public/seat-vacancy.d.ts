export interface SeatVacancy {
  as_of: string; at: 'expiry'; chamber: string;
  last: { person_id: string; name: string; party: string | null; source_url: string | null; start: string; end: string } | null;
}
export interface VacatedSeat { electorate_id: string; name: string; url: string; start: string; end: string }
export function vacancyText(vacancy: { as_of: string; chamber: string }, subject?: string): string;
export function lastMemberText(name: string, to: string): string;
export function servedText(seat: string, start: string, end: string): string;
export function seatVacancy(detail: unknown): SeatVacancy | null;
export function vacatedSeat(person: unknown, electorates: readonly unknown[] | null | undefined): VacatedSeat | null;
