/* eslint-disable @typescript-eslint/no-require-imports -- Isolated module-load tests. */
import { copy } from '../src/design/copy';

test('shared copy keeps shell wording and the shorter website menu label', () => {
  const { savedCopyNote, offline, couldNotLoad, todayEnding, ...strings } =
    copy;
  expect(strings).toEqual({
    done: 'Done',
    cancel: 'Cancel',
    notNow: 'Not now',
    tryAgain: 'Try again',
    more: 'More',
    share: 'Share',
    copyLink: 'Copy link',
    openOnWeb: 'Open on opax.com.au',
    follow: 'Follow',
    following: 'Following',
    seeAll: 'See all',
    sources: 'Sources',
    howChosen: 'How this is chosen',
    reportCorrection: 'Report a correction',
    correctionsEmail: 'corrections@opax.com.au',
    copyAddress: 'Copy address',
    someSectionsFailed: "Some sections couldn't be loaded.",
    partialNote: "Some records couldn't be read.",
    machineWritten: 'Machine-written',
    independence:
      'OPAX is independent and non-partisan. It is not a government app.',
    deceasedNotice:
      'Aboriginal and Torres Strait Islander readers are advised that this app contains names and images of people who have died.',
    notSaved: 'Not saved on this iPhone yet',
    notSavedBody: "It will load when you're back online.",
    resetFilters: 'Reset filters',
    partial: 'partial',
    dateNotPublished: 'Date not published',
  });
  expect(savedCopyNote('2026-11-08')).toBe(
    "Showing the copy saved on 8 November. The latest records couldn't be loaded.",
  );
  expect(offline('2026-11-08')).toBe(
    "You're offline. Showing what was saved on 8 Nov.",
  );
  expect(couldNotLoad('Bills')).toBe("Bills couldn't be loaded.");
  expect(couldNotLoad('the bill')).toBe("The bill couldn't be loaded.");
  expect(todayEnding('Saturday 14 November')).toBe(
    "That's the record for Saturday 14 November.",
  );
  expect(
    todayEnding('Saturday 14 November', {
      houses: 'both',
      words: 'Tuesday 17 November',
    }),
  ).toBe(
    "That's the record for Saturday 14 November. Parliament next sits on Tuesday 17 November.",
  );
  expect(Object.isFrozen(copy)).toBe(true);
});
test('date-only values retain the calendar day, and dates accept epoch or Date', () => {
  const date = new Date(2026, 0, 2, 12);
  expect(copy.offline(date)).toBe(
    "You're offline. Showing what was saved on 2 Jan.",
  );
  expect(copy.offline(date.getTime())).toBe(copy.offline(date));
  expect(() => copy.offline('invalid')).toThrow(RangeError);
  expect(() => copy.savedCopyNote('2026-02-30')).toThrow(RangeError);
});
test.each([
  ['ios', true, 'iPad'],
  ['android', false, 'phone'],
] as const)('storage wording on %s', (os, pad, device) => {
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: os, isPad: pad } }));
    const shared = require('../src/design/copy').copy as typeof copy;
    expect(shared.notSaved).toBe(`Not saved on this ${device} yet`);
  });
  jest.dontMock('react-native');
});
