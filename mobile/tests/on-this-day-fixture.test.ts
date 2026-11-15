import {
  onThisDayAnswer,
  onThisDayLogLine,
  pinnedOnThisDay,
} from '../scripts/on-this-day-fixture';

const pinned = [
  '/bills/index.json',
  '/parliament/on-this-day/09-17.json',
  '/parliament/sitting-days.json',
];

test('any valid day is answered with the pinned day', () => {
  for (const day of ['01-01', '02-29', '11-15', '12-31'])
    expect(
      onThisDayAnswer(`/parliament/on-this-day/${day}.json`, pinned),
    ).toEqual({
      day,
      pinned: '09-17',
      path: '/parliament/on-this-day/09-17.json',
    });
  // The pinned day itself is served as itself.
  expect(
    onThisDayAnswer('/parliament/on-this-day/09-17.json', pinned)?.path,
  ).toBe('/parliament/on-this-day/09-17.json');
});

test('with nothing pinned a valid day is a quiet 404, not a boundary failure', () => {
  expect(
    onThisDayAnswer('/parliament/on-this-day/11-15.json', [
      '/bills/index.json',
    ]),
  ).toEqual({ day: '11-15', pinned: null, path: null });
});

test('with several pinned, the first in order is the one served', () => {
  const two = [
    '/parliament/on-this-day/11-02.json',
    '/parliament/on-this-day/03-09.json',
  ];
  expect(pinnedOnThisDay(two)).toEqual([
    '/parliament/on-this-day/03-09.json',
    '/parliament/on-this-day/11-02.json',
  ]);
  expect(
    onThisDayAnswer('/parliament/on-this-day/06-01.json', two)?.pinned,
  ).toBe('03-09');
  expect(
    onThisDayAnswer('/parliament/on-this-day/11-02.json', two)?.pinned,
  ).toBe('11-02');
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
  '/parliament/on-this-day/11-15.json/extra',
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
  },
);

test('the log line names the asked day and what answered it', () => {
  expect(
    onThisDayLogLine(
      onThisDayAnswer('/parliament/on-this-day/11-15.json', pinned)!,
    ),
  ).toBe('ONTHISDAY_PINNED 11-15 -> 09-17');
  const absent = onThisDayLogLine(
    onThisDayAnswer('/parliament/on-this-day/11-15.json', [])!,
  );
  expect(absent).toBe('ONTHISDAY_PINNED 11-15 -> not pinned (404, no rows)');
  // The run's boundary check greps fixture.log for these.
  for (const line of [absent, 'ONTHISDAY_PINNED 11-15 -> 09-17'])
    expect(line).not.toMatch(
      /OUTSIDE_ALLOW_LIST|"allowed":false|opax\.com\.au/,
    );
});
