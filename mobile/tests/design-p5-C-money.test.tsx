import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { money } from '../src/features/money-public/runtime';
import { ChoiceChips, Field, StepButtons } from '../src/design/primitives';
import { PopUpButton, SegmentedPicker } from '../src/design/controls';
import { FigureBlock } from '../src/design/record';
import { MoneyRow } from '../src/design/rows';
import { SourceLine } from '../src/design/source';
import Grants from '../src/features/money-public/Grants';
import Largest, {
  MONTH_FADE_MS,
  monthName,
  shiftMonth,
} from '../src/features/money-public/Largest';
import { Animated, FlatList } from 'react-native';
import { useReduceMotion } from '../src/design/accessibility';
import Agencies from '../src/features/money-public/Agencies';
import Allocation, { inState } from '../src/features/money-public/Allocation';
import Connections, {
  CONNECTIONS_CITATION,
} from '../src/features/money-public/Connections';
import { loadMoneyItem } from '../src/features/money-public/MoneyItem';
import {
  moneyCitation,
  readableDates,
} from '../src/features/money-public/parts';
import { decodeAllocation } from '../src/features/money-public/data';

// Design programme pass 5, lane C, as the Apple-design programme redrew it
// (specs/money.md 1.2 to 1.5, 2.2 to 2.12): short publisher names (P2-5),
// one source line per block (P3-9), the state filter in the Filters sheet
// (P2-15, which replaced the chips), months by name and dates in words
// (P3-12), and money figures in the money accent (P3-3).
const mockParams: Record<string, string> = {};
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: jest.fn(() => false),
}));
const mockOptions: { current: Record<string, unknown> } = { current: {} };
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const Wrap = (props: object) => React.createElement(View, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    useSegments: () => [],
    useLocalSearchParams: () => mockParams,
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: {
      Screen: ({ options }: { options: Record<string, unknown> }) => {
        mockOptions.current = options;
        return null;
      },
    },
  };
});
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { discovery: jest.fn(), directory: jest.fn() },
}));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const client: Pick<ApiClient, 'get'> = {
  async get<T>(
    path: string,
    decode: (v: unknown) => T,
  ): Promise<RecordResult<T>> {
    return { data: decode(raw(path)), stale: false, savedAt: 10, asOf: null };
  },
};
const fixture = new MoneyCatalogs(client);
beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  mockOptions.current = {};
  for (const name of [
    'grants',
    'notes',
    'program',
    'largest',
    'agencies',
    'agency',
    'report',
    'allocation',
    'history',
    'locations',
    'connections',
    'evidence',
  ] as const)
    money[name] = fixture[name].bind(fixture) as never;
  const { catalogs } = jest.requireMock('../src/api/runtime');
  catalogs.discovery.mockRejectedValue(new Error('offline'));
  catalogs.directory.mockRejectedValue(new Error('offline'));
});
async function render(Screen: () => React.ReactNode) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Screen />);
  });
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  return r;
}
const figure = (root: ReactTestInstance, testID: string) =>
  root.findAllByType(FigureBlock).find((f) => f.props.testID === testID)!;
const caption = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (n) => n.props.testID === testID && typeof n.type !== 'string',
  )[0]!.props.children as string;
/** Type into the bar's search field. */
const search = (text: string) =>
  act(async () =>
    (
      mockOptions.current.headerSearchBarOptions as {
        onChangeText: (e: { nativeEvent: { text: string } }) => void;
      }
    ).onChangeText({ nativeEvent: { text } }),
  );
/** Tree order of the host nodes carrying these test IDs. */
const order = (root: ReactTestInstance, ids: string[]) =>
  ids.map((id) =>
    root
      .findAll(() => true)
      .findIndex((n) => n.props.testID === id && typeof n.type === 'string'),
  );

describe('P2-5: short publisher names', () => {
  test('a money export’s raw source reads as its publisher, with no pipeline words', () => {
    const agencies = raw('/agencies.json').meta.source as string;
    expect(agencies).toMatch(/amendment lineage/);
    expect(moneyCitation(agencies)).toEqual({
      label: 'AusTender',
      title: 'AusTender, Department of Finance',
    });
    expect(moneyCitation('GrantConnect grant awards').label).toBe(
      'GrantConnect',
    );
    // Queensland grants name the publisher, not the portal (spec 1.2).
    expect(moneyCitation('QLD Government Investment Portal').label).toBe(
      'Queensland Treasury',
    );
    expect(moneyCitation('Departmental invitation list').label).toBe(
      'Departmental invitation list',
    );
  });
  test('agencies, programs and places, and community funding cite their publishers', async () => {
    let r = await render(Agencies);
    expect(figure(r.root, 'agencies-total').props.source.citation).toEqual([
      { label: 'AusTender', title: 'AusTender, Department of Finance' },
    ]);
    await act(async () => r.unmount());

    r = await render(Connections);
    const line = r.root
      .findAllByType(SourceLine)
      .find((s) => s.props.testID === 'connections-source')!;
    expect(line.props.citation).toEqual(CONNECTIONS_CITATION);
    expect(CONNECTIONS_CITATION.map((c) => c.label)).toEqual([
      'Hansard',
      'Press releases',
      'Queensland grants',
    ]);
    await act(async () => r.unmount());

    r = await render(Allocation);
    expect(figure(r.root, 'allocation-figure').props.source.citation).toEqual([
      expect.objectContaining({ label: 'GrantConnect' }),
    ]);
    await act(async () => r.unmount());
  });
  test('a contract’s page names its register short, with its record ID', async () => {
    const agency = 'a-7431f054588d4251c0b4';
    const id = raw(`/agencies/${agency}.json`).contracts[0].id as string;
    const item = (await loadMoneyItem({ kind: 'contract', agency, id }, false))
      .data;
    expect(item.register).toBe('AusTender');
    expect(item.originals[0]!.label).toBe(`AusTender register · ${id}`);
    expect(item.facts.find((f) => f.label === 'Register ID')!.value).toBe(id);
  });
});

describe('P3-9: one source line per block', () => {
  test('Largest and Programs and places put the line after their rows', async () => {
    for (const [Screen, row, foot] of [
      [Largest, 'largest-recipient-0', 'largest-list-source-foot'],
      [Connections, null, 'connections-list-source-foot'],
    ] as const) {
      const r = await render(Screen);
      const first = row
        ? order(r.root, [row])[0]!
        : r.root
            .findAll(() => true)
            .findIndex(
              (n) =>
                typeof n.type === 'string' &&
                /^connection-open-/.test(n.props.testID ?? ''),
            );
      const [end] = order(r.root, [foot]);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(first);
      await act(async () => r.unmount());
    }
  });
  test('a figure list’s only line above its rows is the figure’s own', async () => {
    for (const [Screen, figureID, row] of [
      [Agencies, 'agencies-total', 'agency-row-0'],
      [Allocation, 'allocation-figure', 'allocation-project-0'],
    ] as const) {
      const r = await render(Screen);
      const nodes = r.root.findAll(() => true);
      const firstRow = order(r.root, [row])[0]!;
      const lines = nodes
        .map((n, i) => [n, i] as const)
        .filter(([n, i]) => n.type === SourceLine && i < firstRow);
      expect(lines).toHaveLength(1);
      expect(figure(r.root, figureID).findAllByType(SourceLine)).toHaveLength(
        1,
      );
      await act(async () => r.unmount());
    }
  });
});

describe('P2-15: community funding filters by state in the Filters sheet', () => {
  test('a state is matched on the export’s codes', () => {
    expect(inState('VIC', 'vic')).toBe(true);
    expect(inState('vic ', 'VIC')).toBe(true);
    expect(inState('NSW', 'vic')).toBe(false);
    expect(inState('NSW', '')).toBe(true);
  });
  test('no chips or text field on the page; the route’s state narrows the projects', async () => {
    let r = await render(Allocation);
    expect(r.root.findAllByType(ChoiceChips)).toHaveLength(0);
    expect(r.root.findAllByType(Field)).toHaveLength(0);
    const awards = decodeAllocation(raw('/research/mlci.json')).awards;
    const vic = awards.filter((a) => inState(a.state, 'vic')).length;
    expect(vic).toBeGreaterThan(0);
    expect(vic).toBeLessThan(awards.length);
    expect(caption(r.root, 'allocation-caption')).toBe(
      `${awards.length.toLocaleString('en-AU')} awards, largest first`,
    );
    await act(async () => r.unmount());
    mockParams.state = 'vic';
    r = await render(Allocation);
    expect(caption(r.root, 'allocation-caption')).toBe(
      `${vic.toLocaleString('en-AU')} ${vic === 1 ? 'award' : 'awards'} in Victoria, largest first`,
    );
    await act(async () => r.unmount());
  });
});

describe('P3-12: months by name and dates in words', () => {
  test('the month pop-up names every month; no step buttons', async () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('latest', 1)).toBeUndefined();
    expect(monthName('2026-08')).toBe('August 2026');
    const r = await render(Largest);
    expect(r.root.findAllByType(StepButtons)).toHaveLength(0);
    const months = r.root.findByType(PopUpButton);
    for (const option of months.props.options)
      expect(option.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    await act(async () => r.unmount());
  });
  test.each([
    [false, 1],
    [true, 0],
  ])(
    'a new month starts at the top; rows fade in unless Reduce Motion (%s)',
    async (reduced, fades) => {
      jest.mocked(useReduceMotion).mockReturnValue(reduced);
      const scroll = jest.spyOn(FlatList.prototype, 'scrollToOffset');
      // A stub: the test renderer can't connect native-driven views.
      const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
        start: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn(),
      });
      try {
        const r = await render(Largest);
        const months: string[] = r.root
          .findByType(PopUpButton)
          .props.options.map((o: { value: string }) => o.value);
        expect(months.length).toBeGreaterThan(1);
        // The first month shown neither scrolls nor fades.
        expect(scroll).not.toHaveBeenCalled();
        expect(timing).not.toHaveBeenCalled();
        mockParams.month = months[1]!;
        await act(async () => r.update(<Largest />));
        expect(scroll).toHaveBeenCalledTimes(1);
        expect(scroll.mock.calls[0]![0]).toMatchObject({ animated: false });
        expect(scroll.mock.calls[0]![0].offset).toBeLessThanOrEqual(0);
        expect(timing).toHaveBeenCalledTimes(fades);
        if (fades)
          expect(timing.mock.calls[0]![1]).toMatchObject({
            toValue: 1,
            duration: MONTH_FADE_MS,
          });
        expect(MONTH_FADE_MS).toBe(150);
        await act(async () => r.unmount());
      } finally {
        scroll.mockRestore();
        timing.mockRestore();
        jest.mocked(useReduceMotion).mockReturnValue(false);
      }
    },
  );
  test('a list’s notes say dates in words, never ISO dates', async () => {
    expect(readableDates('awards published 2011-03-30 to 2028-05-01')).toBe(
      'awards published 30 Mar 2011 to 1 May 2028',
    );
    expect(readableDates(null)).toBeNull();
    mockParams.jur = 'federal';
    const r = await render(Grants);
    const notes = (
      figure(r.root, 'grants-total').props.source.notes as unknown[]
    ).filter((n): n is string => typeof n === 'string');
    expect(notes.join('\n')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    await act(async () => r.unmount());
  });
});

describe('P3-3: money figures take the money accent', () => {
  test.each([
    ['Grants', Grants, 'grants-total', { jur: 'federal' }],
    ['Agencies', Agencies, 'agencies-total', {}],
    ['Community funding', Allocation, 'allocation-figure', {}],
  ] as const)('%s draws its figure in money ink', async (_n, Screen, id, p) => {
    Object.assign(mockParams, p);
    const r = await render(Screen);
    expect(figure(r.root, id).props.ink).toBe('money');
    expect(figure(r.root, id).props.value).toMatch(/^\$/);
    expect(r.root.findAllByType(MoneyRow).length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
  test('searching keeps the figure and says the count against the whole', async () => {
    const r = await render(Agencies);
    const total = raw('/agencies.json').agencies.length as number;
    await search('no agency is called this');
    expect(figure(r.root, 'agencies-total')).toBeDefined();
    const sort = r.root.findByType(PopUpButton);
    expect(sort.props.options[0].label).toBe(
      `0 of ${total.toLocaleString('en-AU')} agencies, by value`,
    );
    expect(r.root.findAllByType(SegmentedPicker)).toHaveLength(0);
    await act(async () => r.unmount());
  });
});
