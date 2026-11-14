import { act } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import type { ApiClient } from '../src/api/client';
import { ApiError } from '../src/api/errors';
import { assertAllowedPath } from '../src/api/policy';
import { catalogs } from '../src/api/runtime';
import { Text, textContent } from '../src/design/text';
import { SittingLine, useSittingRead } from '../src/features/today/SittingLine';
import {
  decodeSittingDays,
  sittingDaysPath,
  sittingLine,
  sittingSources,
  type SittingDays,
} from '../src/features/today/sitting';
import { presentSource } from '../src/navigation/sheets';
// The published 2026 file (im/sitting-days, f8135b08b), days trimmed to
// 12 October to 26 November: House and Senate, House only (26 to 29 Oct),
// Senate only (16 to 19 Nov), both again (23 to 26 Nov, the year's last).
import raw from './fixtures/sitting-days.json';

jest.mock('../src/api/runtime', () => ({
  catalogs: { sittingDays: jest.fn() },
}));
jest.mock('../src/navigation/sheets', () => ({
  presentSheet: jest.fn(),
  presentSource: jest.fn(),
}));

const file = decodeSittingDays(raw);
const copy = () => JSON.parse(JSON.stringify(raw));
const said = (f: SittingDays, iso: string) =>
  sittingLine(f, new Date(iso))?.text ?? null;

beforeEach(() => {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
});
afterEach(() => jest.mocked(useWindowDimensions).mockRestore());

describe('the rule, in the calendar timezone (Sydney is UTC+11 in November)', () => {
  test.each([
    // Noon in Sydney each day.
    ['both houses', '2026-11-24T01:00:00Z', 'Parliament is sitting today'],
    ['the Senate only', '2026-11-17T01:00:00Z', 'The Senate is sitting today'],
    ['the House only', '2026-10-27T01:00:00Z', 'The House is sitting today'],
    [
      'a weekday off before a House-only sitting',
      '2026-10-23T01:00:00Z',
      'The House next sits Monday 26 October',
    ],
    [
      'a weekday off',
      '2026-11-13T01:00:00Z',
      'The Senate next sits Monday 16 November',
    ],
    [
      'the weekend between sittings',
      '2026-11-21T01:00:00Z',
      'Parliament next sits Monday 23 November',
    ],
  ])('%s', (_case, iso, text) => {
    expect(said(file, iso)).toBe(text);
  });

  test('the day turns at midnight in the calendar timezone, not UTC', () => {
    // Both instants are 15 November in UTC.
    expect(said(file, '2026-11-15T12:59:59Z')).toBe(
      'The Senate next sits Monday 16 November',
    );
    expect(said(file, '2026-11-15T13:00:00Z')).toBe(
      'The Senate is sitting today',
    );
    // The file's own zone decides: 01:00 Monday in Sydney is 22:00 Sunday
    // in Perth.
    const perth = { ...file, timezone: 'Australia/Perth' };
    expect(said(file, '2026-11-15T14:00:00Z')).toBe(
      'The Senate is sitting today',
    );
    expect(said(perth, '2026-11-15T14:00:00Z')).toBe(
      'The Senate next sits Monday 16 November',
    );
  });

  test('past expires: no line, even with sitting days listed', () => {
    const early = { ...file, expires: '2026-11-19' };
    expect(said(early, '2026-11-19T01:00:00Z')).toBe(
      'The Senate is sitting today',
    );
    expect(said(early, '2026-11-20T01:00:00Z')).toBeNull();
    expect(said(early, '2026-11-24T01:00:00Z')).toBeNull();
  });

  test('beyond the published calendar (2027 not published): no line', () => {
    // After the year's last sitting day nothing is published to name.
    expect(said(file, '2026-11-27T01:00:00Z')).toBeNull();
    expect(said(file, '2026-12-21T01:00:00Z')).toBeNull();
    // 31 December is the last covered day; 1 January is past it.
    expect(said(file, '2026-12-31T12:59:59Z')).toBeNull();
    expect(said(file, '2027-01-04T01:00:00Z')).toBeNull();
    // And before coverage starts.
    expect(said(file, '2025-12-31T01:00:00Z')).toBeNull();
  });

  test('a next sitting day in the next published year names it and cites both years', () => {
    const next = copy();
    next.coverage.last = '2027-12-31';
    next.expires = '2027-12-31';
    next.years[1] = {
      year: 2027,
      status: 'published',
      source: {
        ...next.years[0].source,
        title: 'Parliamentary Sittings 2027',
        url: 'https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/2027/Parliamentary_Sittings_2027.ics',
        published: '2026-12-01',
      },
    };
    next.days.push({ date: '2027-02-02', house: true, senate: true });
    const two = decodeSittingDays(next);
    const line = sittingLine(two, new Date('2026-12-21T01:00:00Z'))!;
    expect(line.text).toBe('Parliament next sits Tuesday 2 February');
    expect(line.years).toEqual([2026, 2027]);
    const sheet = sittingSources(two, line);
    expect(sheet.header).toBe('Published 1 December 2026');
    // Both years name the same readable page: one row, both calendars.
    expect(sheet.originals).toEqual([
      {
        label: 'Parliament of Australia',
        url: 'https://www.aph.gov.au/About_Parliament/Sitting_Calendar',
        record: 'Parliamentary Sittings 2026 and Parliamentary Sittings 2027',
        asOf: '2026-12-01',
      },
    ]);
    // Without pages, each year's own calendar file is its row.
    for (const y of next.years) delete y.source.page;
    expect(
      sittingSources(decodeSittingDays(next), line).originals!.map(
        (o) => o.url,
      ),
    ).toEqual([
      'https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/2026/Parliamentary_Sittings_2026.ics',
      'https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/2027/Parliamentary_Sittings_2027.ics',
    ]);
  });

  test('the readable page is optional: with no page the row opens the calendar file', () => {
    const plain = copy();
    delete plain.years[0].source.page;
    const f = decodeSittingDays(plain);
    const line = sittingLine(f, new Date('2026-11-13T01:00:00Z'))!;
    expect(sittingSources(f, line).originals).toEqual([
      {
        label: 'Parliament of Australia',
        url: 'https://static.aph.gov.au/-/media/05_About_Parliament/58_Sitting_Calendars/2026/Parliamentary_Sittings_2026.ics',
        record: 'Parliamentary Sittings 2026',
        asOf: '2026-09-14',
      },
    ]);
  });
});

describe('a bad file is refused whole', () => {
  const bad: [string, (f: ReturnType<typeof copy>) => unknown][] = [
    ['not an object', () => []],
    ['another schema version', (f) => ({ ...f, schema_version: 2 })],
    ['no timezone', (f) => ({ ...f, timezone: undefined })],
    ['an unknown timezone', (f) => ({ ...f, timezone: 'Mars/Olympus_Mons' })],
    [
      'a dated time, not a day',
      (f) => ({ ...f, expires: '2026-12-31T00:00:00Z' }),
    ],
    [
      'coverage backwards',
      (f) => ({ ...f, coverage: { first: '2026-12-31', last: '2026-01-01' } }),
    ],
    [
      'an unknown year status',
      (f) => ({ ...f, years: [{ ...f.years[0], status: 'draft' }] }),
    ],
    [
      'a published year with no source',
      (f) => ({ ...f, years: [{ year: 2026, status: 'published' }] }),
    ],
    [
      'a plain http source',
      (f) => ({
        ...f,
        years: [
          {
            ...f.years[0],
            source: {
              ...f.years[0].source,
              url: 'http://static.aph.gov.au/x.ics',
            },
          },
        ],
      }),
    ],
    [
      'a plain http page',
      (f) => ({
        ...f,
        years: [
          {
            ...f.years[0],
            source: {
              ...f.years[0].source,
              page: 'http://www.aph.gov.au/About_Parliament/Sitting_Calendar',
            },
          },
        ],
      }),
    ],
    [
      'a listed day with no sitting',
      (f) => ({
        ...f,
        days: [{ date: '2026-11-16', house: false, senate: false }],
      }),
    ],
    [
      'a flag that is not true or false',
      (f) => ({
        ...f,
        days: [{ date: '2026-11-16', house: 'yes', senate: true }],
      }),
    ],
    ['days out of order', (f) => ({ ...f, days: [...f.days].reverse() })],
    [
      'a day outside coverage',
      (f) => ({
        ...f,
        days: [...f.days, { date: '2027-02-02', house: true, senate: true }],
      }),
    ],
    ['days missing', (f) => ({ ...f, days: undefined })],
  ];
  test.each(bad)('%s', (_case, mutate) => {
    expect(() => decodeSittingDays(mutate(copy()))).toThrow(ApiError);
  });

  test('the catalog read answers null, never an error, for a missing or bad file', async () => {
    const get = jest.fn();
    const reader = new Catalogs({ get } as unknown as Pick<ApiClient, 'get'>);
    get.mockResolvedValueOnce({ data: file, stale: false, savedAt: 1 });
    expect((await reader.sittingDays())?.data).toBe(file);
    expect(get).toHaveBeenLastCalledWith(
      '/parliament/sitting-days.json',
      decodeSittingDays,
      false,
      { signal: undefined },
    );
    for (const code of ['not-found', 'offline', 'invalid-data'] as const) {
      get.mockRejectedValueOnce(new ApiError(code, 'x'));
      await expect(reader.sittingDays(true)).resolves.toBeNull();
    }
  });
});

test('the calendar is the one new static read the app allows', () => {
  expect(sittingDaysPath).toBe('/parliament/sitting-days.json');
  expect(() => assertAllowedPath(sittingDaysPath)).not.toThrow();
  for (const path of [
    '/parliament/sitting-days.json?year=2027',
    '/parliament/sitting-days.jsonx',
    '/parliament/other.json',
  ])
    expect(() => assertAllowedPath(path)).toThrow();
});

// Today reads the calendar once and hands the answer to the line.
function Line({ now }: { now: Date }) {
  return <SittingLine now={now} sitting={useSittingRead(0)} />;
}

describe('the drawn line', () => {
  async function render(read: unknown, iso = '2026-11-13T01:00:00Z') {
    jest.mocked(catalogs.sittingDays).mockResolvedValue(read as never);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Line now={new Date(iso)} />);
    });
    return renderer;
  }
  const line = (r: TestRenderer.ReactTestRenderer) =>
    r.root.findAll((n) => n.props.testID === 'today-sitting')[0];

  test('is a secondary text button, read as drawn, opening the readable calendar page', async () => {
    const r = await render({ data: file, stale: false, savedAt: 1 });
    const button = line(r)!;
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityLabel).toBe(
      'The Senate next sits Monday 16 November',
    );
    expect(button.props.accessibilityHint).toBe('Opens the sources');
    const text = button.findByType(Text);
    expect(text.props.variant).toBe('secondary');
    // Read as drawn; "Senate" is a marked glossary term inside the line.
    expect(textContent(text.props.children)).toBe(
      'The Senate next sits Monday 16 November',
    );
    expect(
      text.findAll(
        (n) =>
          n.props.testID === 'term-inline-senate' && typeof n.type === 'string',
      ),
    ).toHaveLength(1);
    expect(text.props.numberOfLines).toBeUndefined();
    act(() => button.props.onPress());
    expect(presentSource).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Published 14 September 2026',
        originals: [
          {
            label: 'Parliament of Australia',
            url: 'https://www.aph.gov.au/About_Parliament/Sitting_Calendar',
            record: 'Parliamentary Sittings 2026',
            asOf: '2026-09-14',
          },
        ],
        coverage: 'Calendar to 31 Dec 2026',
        savedAt: null,
      }),
      { testID: 'today-sitting' },
    );
  });

  test('a saved copy offline still draws, and the sheet says it is saved', async () => {
    const r = await render({
      data: file,
      stale: true,
      savedAt: 1_763_000_000_000,
    });
    act(() => line(r)!.props.onPress());
    expect(presentSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ savedAt: 1_763_000_000_000, state: 'saved' }),
      { testID: 'today-sitting' },
    );
  });

  test('draws nothing when the calendar cannot be read or cannot say', async () => {
    expect((await render(null)).toJSON()).toBeNull();
    expect(
      (
        await render(
          { data: file, stale: false, savedAt: 1 },
          '2026-12-21T01:00:00Z',
        )
      ).toJSON(),
    ).toBeNull();
  });

  test('at AX5 it takes the full width, wraps rather than truncating, and keeps the date line cap', async () => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 3.1 });
    const r = await render({ data: file, stale: false, savedAt: 1 });
    const button = line(r)!;
    const style = StyleSheet.flatten(
      typeof button.props.style === 'function'
        ? button.props.style({ pressed: false })
        : button.props.style,
    );
    expect(style.alignSelf).toBe('stretch');
    const text = button.findByType(Text);
    expect(text.props.wordSafe).toBe(true);
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(1.353);
  });
});
