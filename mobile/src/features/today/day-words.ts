/**
 * Day words for Today's masthead, with no React Native import, so the
 * catalog layer (and the Node fixture server that imports it) can use them.
 */
const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const dayWords = (day: Date) =>
  `${weekdays[day.getUTCDay()]} ${day.getUTCDate()} ${months[day.getUTCMonth()]}`;

/** "Monday 23 November": the words for a calendar day ("2026-11-23"). */
export function calendarDayWords(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(date.getTime()) ? null : dayWords(date);
}

/** The device calendar's day, when the Sydney date cannot be read. */
export const deviceDayWords = (now: Date) =>
  `${weekdays[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}`;
