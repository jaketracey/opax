import { calendarDate, type DateInput } from './format';
import { phoneCopy } from './phone-copy';

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
function dayMonth(value: DateInput, short = false): string {
  const date = calendarDate(value);
  if (!date) throw new RangeError('Shared copy requires a valid date');
  const month = months[date.month]!;
  return `${date.day} ${short ? month.slice(0, 3) : month}`;
}

/** Shared wording from shell 2.8. Dates use the reader's calendar day. */
export const copy = Object.freeze({
  done: 'Done',
  cancel: 'Cancel',
  notNow: 'Not now',
  tryAgain: 'Try again',
  more: 'More',
  share: 'Share',
  copyLink: 'Copy link',
  openOnWeb: 'Open on the website',
  follow: 'Follow',
  following: 'Following',
  seeAll: 'See all',
  sources: 'Sources',
  howChosen: 'How this is chosen',
  reportCorrection: 'Report a correction',
  correctionsEmail: 'corrections@opax.com.au',
  copyAddress: 'Copy address',
  someSectionsFailed: "Some sections couldn't be loaded.",
  savedCopyNote: (date: DateInput) =>
    `Showing the copy saved on ${dayMonth(date)}. The latest records couldn't be loaded.`,
  partialNote: "Some records couldn't be read.",
  machineWritten: 'Machine-written',
  independence:
    'OPAX is independent and non-partisan. It is not a government app.',
  deceasedNotice:
    'Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.',
  offline: (date: DateInput) =>
    `You're offline. Showing what was saved on ${dayMonth(date, true)}.`,
  notSaved: phoneCopy('Not saved on this iPhone yet'),
  notSavedBody: "It will load when you're back online.",
  couldNotLoad: (subject: string) =>
    `${subject.charAt(0).toLocaleUpperCase('en-AU')}${subject.slice(1)} couldn't be loaded.`,
  resetFilters: 'Reset filters',
  partial: 'partial',
  dateNotPublished: 'Date not published',
});
