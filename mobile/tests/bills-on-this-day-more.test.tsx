// On this day, divisions and speeches (delight round 4): one division and
// one speech on a bill from this calendar date in an earlier year, from the
// dated index, chosen by date alone and drawn in the frame the bills first
// draw or not at all. Every name here is invented.
import { act } from 'react';
import { RefreshControl, StyleSheet, useWindowDimensions } from 'react-native';
import { NavigationContext } from 'expo-router/react-navigation';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { assertAllowedPath } from '../src/api/policy';
import { catalogs as runtime } from '../src/api/runtime';
import BillsList from '../src/features/bills/BillsList';
import {
  decodeOnThisDayIndex,
  ON_THIS_DAY_DIVISION_RULE,
  ON_THIS_DAY_SPEECH_RULE,
  onThisDayMore,
  onThisDayPath,
  type OnThisDayIndex,
} from '../src/features/bills/on-this-day';
import { billRoute } from '../src/navigation/routes';
import { docRoute } from '../src/navigation/routes/records';
import { withNavigationOptions } from './navigation-options';
import { pinned, slugs } from './pinned';

const mockParams: { q?: string } = {};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn(), setParams: jest.fn() },
  useNavigation: () => ({ setParams: jest.fn() }),
  useIsFocused: () => true,
  Stack: { Screen: () => null },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
const mockGet = jest.fn();
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
  },
  client: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
// A date with no bill introduced in the pinned register: only the index's rows.
let mockDay = '2026-01-01';
jest.mock('../src/features/bills/sydney-day', () => ({
  currentSydneyDay: () => mockDay,
}));
const mockRead = jest.fn();
jest.mock('../src/features/bills/on-this-day-data', () => ({
  ...jest.requireActual('../src/features/bills/on-this-day-data'),
  readOnThisDay: (...args: unknown[]) => mockRead(...args),
}));
const data = jest.requireActual<
  typeof import('../src/features/bills/on-this-day-data')
>('../src/features/bills/on-this-day-data');

const file = (over: Record<string, unknown> = {}) => ({
  schema_version: 1,
  day: '01-01',
  generated_at: '2026-10-04T16:27:54+00:00',
  bills: {
    'au-federal-r1': 'Invented Lighthouses Bill 2019',
    'au-federal-s2': 'Invented Tides Bill 2014',
  },
  divisions: [
    {
      key: 'federal-senate-5',
      date: '2014-01-01',
      house: 'senate',
      stage: null,
      bill: 'au-federal-s2',
      url: 'https://theyvoteforyou.org.au/divisions/senate/2014-01-01/1',
    },
    {
      key: 'federal-representatives-8',
      date: '2019-01-01',
      house: 'representatives',
      stage: 'second reading - amendment',
      bill: 'au-federal-r1',
      url: 'https://theyvoteforyou.org.au/divisions/representatives/2019-01-01/1',
    },
    {
      key: 'federal-representatives-9',
      date: '2026-01-01',
      house: 'representatives',
      stage: 'Third reading',
      bill: 'au-federal-r1',
      url: null,
    },
  ],
  speeches: [
    {
      slug: 'speech-11',
      date: '2014-01-01',
      speaker: 'Invented Speaker One',
      bill: 'au-federal-s2',
    },
    {
      slug: 'speech-12',
      date: '2019-01-01',
      speaker: 'Invented Speaker Two',
      bill: 'au-federal-r1',
    },
    {
      slug: 'speech-13',
      date: '2019-01-01',
      speaker: 'Invented Speaker Three',
      bill: 'au-federal-r1',
    },
  ],
  ...over,
});
const index = (over?: Record<string, unknown>): OnThisDayIndex =>
  decodeOnThisDayIndex(file(over));

describe('the index', () => {
  test('one file a calendar date, and only those paths are allowed', () => {
    expect(onThisDayPath('2026-11-15')).toBe(
      '/parliament/on-this-day/11-15.json',
    );
    for (const day of ['01-01', '02-29', '11-15', '12-31'])
      expect(() =>
        assertAllowedPath(`/parliament/on-this-day/${day}.json`),
      ).not.toThrow();
    for (const path of [
      '/parliament/on-this-day/13-01.json',
      '/parliament/on-this-day/00-10.json',
      '/parliament/on-this-day/1-1.json',
      '/parliament/on-this-day/11-32.json',
      '/parliament/on-this-day/index.json',
      '/parliament/on-this-day/11-15.json?x=1',
      '/parliament/other/11-15.json',
    ])
      expect(() => assertAllowedPath(path)).toThrow();
  });

  test('reads the rows and keeps no party or machine text', () => {
    const read = decodeOnThisDayIndex(
      file({
        speeches: [
          {
            slug: 'speech-11',
            date: '2014-01-01',
            speaker: 'Invented Speaker One',
            bill: 'au-federal-s2',
            party: 'Invented Party',
            brief: 'A machine-written line.',
          },
        ],
      }),
    );
    expect(read.speeches).toEqual([
      {
        slug: 'speech-11',
        date: '2014-01-01',
        speaker: 'Invented Speaker One',
        bill: 'au-federal-s2',
      },
    ]);
    expect(JSON.stringify(read)).not.toMatch(/Invented Party|machine/);
  });

  test.each([
    ['another version', { schema_version: 2 }],
    ['a day that is not a month and day', { day: '2026-01-01' }],
    [
      'a row on another date',
      {
        speeches: [
          {
            slug: 'speech-1',
            date: '2019-01-02',
            speaker: 'Invented Speaker',
            bill: 'au-federal-r1',
          },
        ],
      },
    ],
    [
      'a row whose bill is not named',
      {
        speeches: [
          {
            slug: 'speech-1',
            date: '2019-01-01',
            speaker: 'Invented Speaker',
            bill: 'au-federal-r404',
          },
        ],
      },
    ],
    [
      'a speech with no speaker',
      {
        speeches: [
          {
            slug: 'speech-1',
            date: '2019-01-01',
            speaker: '',
            bill: 'au-federal-r1',
          },
        ],
      },
    ],
  ])('refuses %s', (_name, over) => {
    expect(() => decodeOnThisDayIndex(file(over))).toThrow();
  });
});

describe('the rule', () => {
  test('earlier years only, taking turns year by year in the file’s order', () => {
    // 2026: two earlier divisions, three earlier speeches.
    const picks = onThisDayMore(index(), '2026-01-01');
    expect(picks.division).toEqual({
      division: expect.objectContaining({ key: 'federal-senate-5' }),
      billName: 'Invented Tides Bill 2014',
      year: 2014,
    });
    expect(picks.speech?.speech.slug).toBe('speech-12');
    expect(picks.speech?.year).toBe(2019);
    // 2027: the 2026 division is now a candidate too (three), 2027 mod 3 = 2.
    const next = onThisDayMore(index(), '2027-01-01');
    expect(next.division?.division.key).toBe('federal-representatives-9');
    expect(next.speech?.speech.slug).toBe('speech-13');
    // Every candidate has its turn over as many years as there are candidates.
    const turns = [2028, 2029, 2030].map(
      (year) => onThisDayMore(index(), `${year}-01-01`).speech!.speech.slug,
    );
    expect(new Set(turns).size).toBe(3);
  });

  test('nothing from this year, another day’s file, or no file', () => {
    expect(onThisDayMore(index(), '2014-01-01')).toEqual({
      division: null,
      speech: null,
    });
    expect(onThisDayMore(index(), '2026-01-02')).toEqual({
      division: null,
      speech: null,
    });
    expect(onThisDayMore(null, '2026-01-01')).toEqual({
      division: null,
      speech: null,
    });
    expect(
      onThisDayMore(index({ divisions: [] }), '2026-01-01').division,
    ).toBeNull();
  });

  test('each rule names its source and no person or party', () => {
    expect(ON_THIS_DAY_DIVISION_RULE).toContain('They Vote For You');
    expect(ON_THIS_DAY_SPEECH_RULE).toContain('Hansard');
    for (const rule of [ON_THIS_DAY_DIVISION_RULE, ON_THIS_DAY_SPEECH_RULE])
      expect(rule).not.toMatch(/—|most|top|best|first ever/i);
  });
});

describe('the read', () => {
  beforeEach(() => mockGet.mockReset());

  test('one static read of the day’s file; a failure is no rows, never an error', async () => {
    mockGet.mockResolvedValueOnce({ data: index(), stale: false });
    await expect(data.readOnThisDay('2026-01-01')).resolves.toEqual(index());
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet.mock.calls[0]![0]).toBe(
      '/parliament/on-this-day/01-01.json',
    );
    expect(mockGet.mock.calls[0]![1]).toBe(decodeOnThisDayIndex);
    mockGet.mockRejectedValueOnce(new Error('404'));
    await expect(data.readOnThisDay('2026-01-01')).resolves.toBeNull();
  });

  test('in time it is the index; late it is nothing, and no timer is left', async () => {
    jest.useFakeTimers();
    try {
      await expect(
        data.onThisDayInTime(Promise.resolve(index())),
      ).resolves.toEqual(index());
      expect(jest.getTimerCount()).toBe(0);
      const late = data.onThisDayInTime(new Promise(() => {}));
      jest.advanceTimersByTime(data.ON_THIS_DAY_GRACE_MS);
      await expect(late).resolves.toBeNull();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the rows on Bills', () => {
  const fixture = new Catalogs({
    get: async (path, decode) => ({
      data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
      stale: false,
      savedAt: 1000,
      asOf: null,
    }),
  });
  const mock = jest.mocked(runtime);
  const mounted: TestRenderer.ReactTestRenderer[] = [];
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockParams.q;
    mockDay = '2026-01-01';
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ width: 402, height: 874, scale: 3, fontScale: 1 });
    mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
    mockRead.mockResolvedValue(index());
  });
  afterEach(() => {
    act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  });
  async function render() {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        withNavigationOptions(<BillsList />, () => {}),
      );
    });
    mounted.push(renderer);
    return renderer.root;
  }
  const ids = (root: ReactTestInstance) =>
    root
      .findAll(
        (node) =>
          typeof node.type === 'string' &&
          typeof node.props.testID === 'string',
      )
      .map((node) => node.props.testID as string);
  const host = (root: ReactTestInstance, id: string) =>
    root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === id,
    );
  const link = (root: ReactTestInstance, id: string) =>
    root.find((node) => node.props.testID === id && !!node.props.href);

  test('a division and a speech, each one link that says what the record is and where it is from', async () => {
    const root = await render();
    const [division] = host(root, 'bills-on-this-day-division');
    const [speech] = host(root, 'bills-on-this-day-speech');
    expect(division!.props.accessibilityRole).toBe('link');
    expect(division!.props.accessibilityLabel).toBe(
      'On this day in 2014, Invented Tides Bill 2014, Senate division, 1 January 2014, They Vote For You',
    );
    expect(division!.props.accessibilityHint).toBe(
      'Opens the vote on the bill',
    );
    expect(speech!.props.accessibilityLabel).toBe(
      'On this day in 2019, Invented Speaker Two spoke on the Invented Lighthouses Bill 2019, 1 January 2019, Hansard',
    );
    expect(speech!.props.accessibilityHint).toBe('Opens the speech');
    // No result, count, party or summary in either row.
    for (const row of [division!, speech!])
      expect(row.props.accessibilityLabel).not.toMatch(
        /ayes|noes|agreed|passed|party/i,
      );
    expect(link(root, 'bills-on-this-day-division').props.href).toEqual(
      billRoute('au-federal-s2', 'Invented Tides Bill 2014', {
        division: 'federal-senate-5',
      }),
    );
    expect(link(root, 'bills-on-this-day-speech').props.href).toEqual(
      docRoute('speech-12', 'Invented Speaker Two'),
    );
    expect(mockRead).toHaveBeenCalledTimes(1);
    expect(mockRead.mock.calls[0]![0]).toBe(mockDay);
  });

  test('a recorded stage is said in plain words', async () => {
    mockRead.mockResolvedValue(index({ divisions: [file().divisions[1]] }));
    const root = await render();
    expect(
      host(root, 'bills-on-this-day-division')[0]!.props.accessibilityLabel,
    ).toBe(
      'On this day in 2019, Invented Lighthouses Bill 2019, House of Representatives division, second reading, 1 January 2019, They Vote For You',
    );
  });

  test('they are in the frame the bills first draw, below everything already on screen', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mock.bills.mockImplementation(async (refresh) => {
      await gate;
      return fixture.bills(refresh);
    });
    const root = await render();
    const before = ids(root);
    expect(before).toContain('bills-votes');
    expect(before.some((id) => id.startsWith('bills-on-this-day'))).toBe(false);
    await act(async () => {
      release();
    });
    await act(async () => {});
    const after = ids(root);
    const division = after.indexOf('bills-on-this-day-division');
    const speech = after.indexOf('bills-on-this-day-speech');
    const firstBill = after.findIndex((id) => id.startsWith('bill-row-'));
    expect(division).toBeGreaterThan(-1);
    expect(speech).toBeGreaterThan(division);
    expect(firstBill).toBeGreaterThan(speech);
    for (const id of before.filter((id) => after.includes(id)))
      expect(after.indexOf(id)).toBeLessThan(division);
    expect(after.indexOf('bills-count')).toBeLessThan(division);
  });

  test('an index that answers after the list has drawn adds nothing, then or on refresh', async () => {
    let answer!: (value: OnThisDayIndex) => void;
    mockRead.mockReturnValue(
      new Promise<OnThisDayIndex>((resolve) => {
        answer = resolve;
      }),
    );
    const root = await render();
    // The list waits only the grace for the index.
    await act(async () => {
      await new Promise((resolve) =>
        setTimeout(resolve, data.ON_THIS_DAY_GRACE_MS + 50),
      );
    });
    const drawn = ids(root);
    expect(drawn.some((id) => id.startsWith('bill-row-'))).toBe(true);
    expect(drawn.some((id) => id.startsWith('bills-on-this-day'))).toBe(false);
    await act(async () => {
      answer(index());
    });
    expect(ids(root)).toEqual(drawn);
    mockRead.mockResolvedValue(index());
    await act(async () => {
      root.findByType(RefreshControl).props.onRefresh();
    });
    await act(async () => {});
    expect(mock.bills).toHaveBeenCalledTimes(2);
    expect(ids(root)).toEqual(drawn);
    // A refresh never reads the index again.
    expect(mockRead).toHaveBeenCalledTimes(1);
  });

  test('a kind with no record on this date has no row; no file, no rows', async () => {
    mockRead.mockResolvedValue(index({ divisions: [] }));
    const only = await render();
    expect(host(only, 'bills-on-this-day-division')).toHaveLength(0);
    expect(host(only, 'bills-on-this-day-speech')).toHaveLength(1);
    mockRead.mockResolvedValue(null);
    const none = await render();
    expect(ids(none).some((id) => id.startsWith('bills-on-this-day'))).toBe(
      false,
    );
  });

  describe('on a new day', () => {
    const nextDay = '2026-01-02';
    const nextIndex = () =>
      index({
        day: '01-02',
        divisions: [
          {
            key: 'federal-senate-7',
            date: '2015-01-02',
            house: 'senate',
            stage: 'Third reading',
            bill: 'au-federal-s2',
            url: null,
          },
        ],
        speeches: [
          {
            slug: 'speech-21',
            date: '2015-01-02',
            speaker: 'Invented Speaker Four',
            bill: 'au-federal-s2',
          },
        ],
      });
    let listeners: Record<string, (() => void)[]>;
    let focused: boolean;
    async function renderWatched() {
      listeners = {};
      focused = true;
      const navigation = {
        setOptions: () => {},
        getState: () => ({ index: 0, routes: [{ key: 'r', name: 'index' }] }),
        isFocused: () => focused,
        addListener: (type: string, handler: () => void) => {
          (listeners[type] ??= []).push(handler);
          return () => {};
        },
        removeListener: () => {},
      };
      let renderer!: TestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = TestRenderer.create(
          <NavigationContext.Provider value={navigation as never}>
            <BillsList />
          </NavigationContext.Provider>,
        );
      });
      mounted.push(renderer);
      return renderer.root;
    }
    const emit = (type: string) =>
      act(async () => {
        listeners[type]!.forEach((handler) => handler());
      });
    const labels = (root: ReactTestInstance) =>
      ['bills-on-this-day-division', 'bills-on-this-day-speech'].map(
        (id) =>
          host(root, id)[0]?.props.accessibilityLabel as string | undefined,
      );
    const first = [
      'On this day in 2014, Invented Tides Bill 2014, Senate division, 1 January 2014, They Vote For You',
      'On this day in 2019, Invented Speaker Two spoke on the Invented Lighthouses Bill 2019, 1 January 2019, Hansard',
    ];
    const second = [
      'On this day in 2015, Invented Tides Bill 2014, Senate division, third reading, 2 January 2015, They Vote For You',
      'On this day in 2015, Invented Speaker Four spoke on the Invented Tides Bill 2014, 2 January 2015, Hansard',
    ];
    beforeEach(() => {
      mockRead.mockImplementation(async (day: string) =>
        day === nextDay ? nextIndex() : index(),
      );
    });

    test('with the list in view the rows stay, exactly their size, under their own dates', async () => {
      const root = await renderWatched();
      expect(labels(root)).toEqual(first);
      const drawn = ids(root);
      // Before the day passes the date is there, holding its space unseen.
      for (const id of [
        'bills-on-this-day-division',
        'bills-on-this-day-speech',
      ])
        expect(
          StyleSheet.flatten(host(root, `${id}-date`)[0]!.props.style).opacity,
        ).toBe(0);
      mockDay = nextDay;
      await emit('focus');
      // Nothing was read or chosen for the new day while the list is in view.
      expect(mockRead).toHaveBeenCalledTimes(1);
      expect(labels(root)).toEqual(
        first.map((label) => label.replace(/^On this day in \d{4}, /, '')),
      );
      for (const [id, date] of [
        ['bills-on-this-day-division', '1 January 2014'],
        ['bills-on-this-day-speech', '1 January 2019'],
      ] as const) {
        // Both lines are laid out in one cell; only the date is seen.
        const [kicker] = host(root, `${id}-kicker`);
        const [over] = host(root, `${id}-date`);
        expect(StyleSheet.flatten(kicker!.props.style).opacity).toBe(0);
        expect(over!.props.children).toBe(date);
        const style = StyleSheet.flatten(over!.props.style);
        expect(style.opacity).not.toBe(0);
        expect(style.position).toBeUndefined();
        expect(style).toMatchObject({ width: '100%', marginLeft: '-100%' });
      }
      // Nothing was added or removed: the dates were laid out all along.
      expect(ids(root)).toEqual(drawn);
    });

    test('out of sight it reads the new day’s index and chooses again', async () => {
      const root = await renderWatched();
      mockDay = nextDay;
      focused = false;
      await emit('blur');
      await act(async () => {});
      expect(mockRead).toHaveBeenCalledTimes(2);
      expect(mockRead.mock.calls[1]![0]).toBe(nextDay);
      expect(labels(root)).toEqual(second);
    });

    test('an index that answers once the list is back in view waits for the next blur', async () => {
      let answer!: (value: OnThisDayIndex) => void;
      const root = await renderWatched();
      mockRead.mockReturnValue(
        new Promise<OnThisDayIndex>((resolve) => {
          answer = resolve;
        }),
      );
      mockDay = nextDay;
      focused = false;
      await emit('blur');
      // Chosen again out of sight: yesterday's rows are gone, today's unread.
      expect(labels(root)).toEqual([undefined, undefined]);
      focused = true;
      await emit('focus');
      const inView = ids(root);
      await act(async () => {
        answer(nextIndex());
      });
      expect(ids(root)).toEqual(inView);
      focused = false;
      await emit('blur');
      expect(labels(root)).toEqual(second);
    });
  });

  test('a search hides them', async () => {
    mockParams.q = 'bill';
    const root = await render();
    expect(ids(root).some((id) => id.startsWith('bills-on-this-day'))).toBe(
      false,
    );
  });
});
