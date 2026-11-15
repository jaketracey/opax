import {
  onThisDayAnswer,
  onThisDayLogLine,
} from '../scripts/on-this-day-fixture';

const pinned = [
  '/bills/index.json',
  '/parliament/on-this-day/09-17.json',
  '/parliament/sitting-days.json',
];

test('a day the snapshot pins is served as itself', () => {
  expect(onThisDayAnswer('/parliament/on-this-day/09-17.json', pinned)).toEqual(
    { day: '09-17', pinned: true },
  );
});

test('any other valid day is a quiet 404: another day is never served in its place', () => {
  for (const day of ['01-01', '02-29', '02-31', '11-15', '12-31'])
    expect(
      onThisDayAnswer(`/parliament/on-this-day/${day}.json`, pinned),
    ).toEqual({ day, pinned: false });
  expect(
    onThisDayAnswer('/parliament/on-this-day/11-15.json', [
      '/bills/index.json',
    ]),
  ).toEqual({ day: '11-15', pinned: false });
});

test.each([
  '/parliament/on-this-day/13-40.json',
  '/parliament/on-this-day/00-10.json',
  '/parliament/on-this-day/11-32.json',
  '/parliament/on-this-day/11-15.json.bak',
  '/parliament/on-this-day/11-15.json?x=1',
  '/parliament/on-this-day/11-15',
  '/parliament/on-this-day/1-5.json',
  '/parliament/on-this-day/2026-11-15.json',
  '/parliament/on-this-day/../on-this-day/11-15.json',
  '/parliament/on-this-day/../../bills/index.json',
  '/parliament/on-this-day/%2e%2e/11-15.json',
  '/parliament/on-this-day/%31%31-15.json',
  '/parliament/on-this-day/11-15.json/extra',
  '/parliament/on-this-day//11-15.json',
  '/parliament/on-this-day/',
  '/parliament/on-this-days/11-15.json',
  '/parliament/sitting-days.json',
  '/x/parliament/on-this-day/11-15.json',
  '/bills/index.json',
  '/',
])(
  '%s is not an on-this-day day: the allow-list decides it as before',
  (path) => {
    expect(onThisDayAnswer(path, pinned)).toBeNull();
    expect(onThisDayAnswer(path, [path])).toBeNull();
  },
);

test('the log line names the asked day and what it was given', () => {
  const absent = onThisDayLogLine({ day: '11-15', pinned: false });
  const served = onThisDayLogLine({ day: '09-17', pinned: true });
  expect(absent).toBe('ONTHISDAY 11-15 -> 404 (not pinned)');
  expect(served).toBe('ONTHISDAY 09-17 -> pinned');
  // The run's boundary check greps fixture.log for these.
  for (const line of [absent, served])
    expect(line).not.toMatch(
      /OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au/,
    );
});
