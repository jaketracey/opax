/** Shared, offline hub derivation. The browser never requests a knowledge box. */
export const day = value => {
  const d = typeof value === 'string' ? value.slice(0, 10) : '';
  const time = Date.parse(d + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === d ? d : '';
};
export const latest = dates => dates.map(day).filter(Boolean).sort().at(-1) || '';
const within = (date, start, end) => day(date) && day(date) >= start && day(date) <= end;
export const houseName = house => ({ representatives: 'House of Representatives', senate: 'Senate' }[house] || 'House not recorded');
export const sydneyDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function deriveWeek(period, bills, divisions, configDate) {
  const federal = r => r.jurisdiction === 'federal' || /^(?:au-)?federal-/.test(r.key || '');
  const introduced = bills.filter(b => federal(b) && within(b.introduced, period.start, period.end) && period.houses.includes(b.originating_house));
  const held = divisions.filter(d => federal(d) && within(d.date, period.start, period.end) && period.houses.includes(d.house));
  const order = (a, b) => (a.introduced || a.date).localeCompare(b.introduced || b.date) || a.key.localeCompare(b.key);
  return { ...period, bills: introduced.sort(order), divisions: held.sort(order), lastmod: latest([...introduced.map(b => b.introduced), ...held.map(d => d.date)]) || configDate };
}
export function orderedWeeks(weeks, today) {
  const state = w => today >= w.start && today <= w.end ? 0 : today < w.start ? 1 : 2;
  return [...weeks].sort((a, b) => state(a) - state(b) || (state(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));
}
export function currentSittingPath(weeks, today) {
  const w = orderedWeeks(weeks, today)[0];
  return w ? `/sitting/${w.start}` : '/sitting';
}
/** Rolling 12 months to each export date, by publication (contracts) or agreement (grants). */
export function recentWindow(asOf) {
  const end = day(asOf);
  if (!end) throw new Error('Missing hub source snapshot date');
  const date = new Date(end + 'T00:00:00Z');
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  date.setUTCDate(date.getUTCDate() + 1);
  return { start: date.toISOString().slice(0, 10), end };
}
export function recentRecords(rows, window, dateKey, valueKey) {
  const seen = new Set();
  const kept = rows.filter(r => {
    if (!r.id || seen.has(r.id) || !within(r[dateKey], window.start, window.end) || !Number.isFinite(r[valueKey])) return false;
    seen.add(r.id); return true;
  });
  return { count: kept.length, total: kept.reduce((sum, r) => sum + r[valueKey], 0), largest: kept.sort((a, b) => b[valueKey] - a[valueKey] || a.id.localeCompare(b.id)).slice(0, 3) };
}
