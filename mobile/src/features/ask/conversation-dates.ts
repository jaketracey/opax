import type { Chat } from './model';

/**
 * The reader's own history is dated in the DEVICE time zone (specs/ask.md
 * 6.1): a reader in Perth at 11:30 pm sees that evening's conversation under
 * "Today". `Chat.updated` is in epoch seconds.
 */
export type DateGroupTitle =
  | 'Today'
  | 'Yesterday'
  | 'Previous 7 days'
  | 'Earlier';
export interface DateGroup {
  title: DateGroupTitle;
  chats: Chat[];
}
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
/** The calendar day a moment falls on in `timeZone`, as a day number. */
function dayNumber(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Math.round(
    Date.UTC(get('year'), get('month') - 1, get('day')) / 864e5,
  );
}
/** Whole calendar days between a conversation and now, in the device zone. */
export function daysAgo(
  updatedSeconds: number,
  now: number,
  timeZone = deviceZone(),
) {
  return dayNumber(now, timeZone) - dayNumber(updatedSeconds * 1000, timeZone);
}
function groupTitle(days: number): DateGroupTitle {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 days';
  return 'Earlier';
}
const order: DateGroupTitle[] = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Earlier',
];
/** Newest first, under "Today", "Yesterday", "Previous 7 days" and "Earlier". */
export function groupByDate(
  chats: readonly Chat[],
  now: number,
  timeZone = deviceZone(),
): DateGroup[] {
  const groups = new Map<DateGroupTitle, Chat[]>();
  for (const chat of [...chats].sort((a, b) => b.updated - a.updated)) {
    const title = groupTitle(daysAgo(chat.updated, now, timeZone));
    groups.set(title, [...(groups.get(title) ?? []), chat]);
  }
  return order.flatMap((title) =>
    groups.has(title) ? [{ title, chats: groups.get(title)! }] : [],
  );
}
/** "9:41 am" today, "Yesterday", "Tuesday", "3 Nov" this year, "3 Nov 2025". */
export function conversationWhen(
  updatedSeconds: number,
  now: number,
  timeZone = deviceZone(),
): string {
  const at = new Date(updatedSeconds * 1000);
  const days = daysAgo(updatedSeconds, now, timeZone);
  if (days <= 0)
    return new Intl.DateTimeFormat('en-AU', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .format(at)
      .replace(/\s+/g, ' ')
      .toLowerCase();
  if (days === 1) return 'Yesterday';
  if (days < 7)
    return new Intl.DateTimeFormat('en-AU', {
      timeZone,
      weekday: 'long',
    }).format(at);
  const year = (ms: number) =>
    new Intl.DateTimeFormat('en-AU', { timeZone, year: 'numeric' }).format(ms);
  const sameYear = year(at.getTime()) === year(now);
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(at)
    .replace(/\./g, '');
}
/** "3 questions · 9:41 am": the second line of a conversation row. */
export function conversationMeta(
  chat: Chat,
  now: number,
  timeZone = deviceZone(),
): string {
  const questions = chat.thread.filter((turn) => turn.role === 'user').length;
  return `${questions} ${questions === 1 ? 'question' : 'questions'} · ${conversationWhen(chat.updated, now, timeZone)}`;
}
