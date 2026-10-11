import { act } from 'react';
import { Text as NativeText } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { money } from '../src/features/money-public/runtime';
import {
  ChoiceChips,
  Field,
  SourceLine,
  StepButtons,
  Text,
} from '../src/design/primitives';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import Largest, { shiftMonth } from '../src/features/money-public/Largest';
import Agencies, { Agency } from '../src/features/money-public/Agencies';
import Discover from '../src/features/money-public/Discover';
import Allocation, {
  STATE_CHOICES,
  inState,
} from '../src/features/money-public/Allocation';
import Connections from '../src/features/money-public/Connections';
import {
  FIRST_PAGE,
  moneyCitation,
  readableDates,
  sourceIndex,
} from '../src/features/money-public/parts';
import { decodeAllocation } from '../src/features/money-public/data';

// Design programme pass 5, lane C (docs/design/review-2026-10/
// pass5-app-critique.md): short publisher names (P2-5), the list's source
// line at the foot of its first page (P3-9), the state filter as chips
// (P2-15), named months and readable dates (P3-12), and money figures in
// the money accent (P3-3).
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({ catalogs: { discovery: jest.fn() } }));
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
  catalogs.discovery.mockImplementation(async () => ({
    data: jest
      .requireActual('../src/api/catalog-decoders')
      .decodeDiscovery(raw('/discovery.json')),
    stale: false,
    savedAt: 10,
    asOf: null,
  }));
});
async function render(Screen: () => React.ReactNode) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Screen />);
    await Promise.resolve();
  });
  return r;
}
const source = (root: ReactTestInstance, testID: string) =>
  root.findAllByType(SourceLine).find((s) => s.props.testID === testID);
/** Every string a screen draws or speaks. */
const drawn = (root: ReactTestInstance) =>
  root
    .findAll(() => true)
    .flatMap((n) =>
      [
        n.props.accessibilityLabel,
        n.props.label,
        n.props.title,
        ...[n.props.children].flat(3),
      ].filter((v): v is string => typeof v === 'string'),
    )
    .join('\n');
/** Tree order of the nodes carrying these test IDs. */
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
    expect(moneyCitation('QLD Government Investment Portal').label).toBe(
      'Queensland Government Investment Portal',
    );
    // Anything else goes through the shared reading.
    expect(moneyCitation('Departmental invitation list').label).toBe(
      'Departmental invitation list',
    );
  });
  test('agencies, programs and places, and community funding cite their publishers', async () => {
    let r = await render(Agencies);
    await act(async () =>
      r.root
        .findAllByType(Field)
        .find((f) => f.props.testID === 'agencies-search')!
        .props.onChangeText('nothing is called this'),
    );
    const agencies = source(r.root, 'agencies-source')!;
    expect(agencies.props.citation).toEqual([
      { label: 'AusTender', title: 'AusTender, Department of Finance' },
    ]);
    expect(agencies.props.originals[0].label).toBe('AusTender');
    expect(drawn(r.root)).not.toMatch(/lineage/);
    await act(async () => r.unmount());

    // An empty search draws the line at the list's foot, whatever the
    // list's virtualised window has drawn.
    const search = async (testID: string) =>
      act(async () =>
        r.root
          .findAllByType(Field)
          .find((f) => f.props.testID === testID)!
          .props.onChangeText('nothing is called this'),
      );
    r = await render(Connections);
    await search('connections-search');
    expect(source(r.root, 'connections-source')!.props.citation).toEqual([
      expect.objectContaining({ label: 'Public records' }),
    ]);
    expect(drawn(r.root)).not.toMatch(/corpus/i);
    await act(async () => r.unmount());

    r = await render(Allocation);
    await search('allocation-search');
    expect(source(r.root, 'allocation-source')!.props.citation).toEqual([
      expect.objectContaining({ label: 'GrantConnect' }),
    ]);
    expect(drawn(r.root)).not.toMatch(/verified historical grant venues/);
    await act(async () => r.unmount());
  });
  test('a row’s source names its register short, with its record ID', async () => {
    mockParams.id = 'a-7431f054588d4251c0b4';
    const r = await render(Agency);
    await act(async () =>
      r.root
        .findAllByType(ChoiceChips)[0]!
        .props.onChange('contracts' as never),
    );
    const row = source(r.root, 'agency-source-0')!;
    expect(row.props.citation).toEqual([
      expect.objectContaining({ label: 'AusTender' }),
    ]);
    expect(row.props.originals[0].label).toBe('AusTender');
    await act(async () => r.unmount());
  });
});

describe('P3-9: a list’s source line sits at the foot of its first page', () => {
  test('the row it follows: the first page’s last row, in a grid’s first column', () => {
    expect(FIRST_PAGE).toBe(10);
    expect(sourceIndex(0)).toBe(-1);
    expect(sourceIndex(3)).toBe(2);
    expect(sourceIndex(10)).toBe(9);
    expect(sourceIndex(250)).toBe(9);
    // Two columns: twenty rows a page, under the left cell of its last row.
    expect(sourceIndex(250, 2)).toBe(18);
    expect(sourceIndex(5, 2)).toBe(4);
    expect(sourceIndex(4, 2)).toBe(2);
  });
  test('agencies: the title, then the rows, then the source line', async () => {
    const r = await render(Agencies);
    const name = raw('/agencies.json').agencies[0].name as string;
    await act(async () =>
      r.root
        .findAllByType(Field)
        .find((f) => f.props.testID === 'agencies-search')!
        .props.onChangeText(name),
    );
    const [title, row, foot] = order(r.root, [
      'agencies-title',
      'agency-row-0',
      'agencies-list-source-foot',
    ]);
    expect(title).toBeGreaterThanOrEqual(0);
    expect(row).toBeGreaterThan(title!);
    expect(foot).toBeGreaterThan(row!);
    expect(source(r.root, 'agencies-source')).toBeDefined();
    // An empty search keeps the line, at the list's foot.
    await act(async () =>
      r.root
        .findAllByType(Field)
        .find((f) => f.props.testID === 'agencies-search')!
        .props.onChangeText('no agency is called this'),
    );
    expect(source(r.root, 'agencies-source')).toBeDefined();
    const [end, empty] = order(r.root, [
      'agencies-list-source-foot',
      'agencies-list-end',
    ]);
    expect(end).toBeGreaterThanOrEqual(0);
    expect(empty).toBeGreaterThan(end!);
    await act(async () => r.unmount());
  });
  test.each([
    ['Programs & places', Connections, 'connections-title', 'connections'],
    ['Discover', Discover, 'discover-title', 'discover'],
    ['Allocation', Allocation, 'allocation-title', 'allocation'],
    ['Largest', Largest, 'largest-title', 'largest'],
  ] as const)(
    '%s draws no source line above its rows',
    async (_name, Screen, title, list) => {
      const r = await render(Screen);
      const header = order(r.root, [title])[0]!;
      const firstRow = r.root
        .findAll(() => true)
        .findIndex(
          (n) =>
            typeof n.type === 'string' &&
            /-(row|card|project|recipient)-0$|^connection-open-/.test(
              n.props.testID ?? '',
            ),
        );
      expect(header).toBeGreaterThanOrEqual(0);
      // Every source line in the header is gone: the first one follows a row.
      const lines = r.root
        .findAll(() => true)
        .map((n, i) => [n, i] as const)
        .filter(
          ([n]) =>
            n.type === SourceLine && !/-\d+(-\d+)?$/.test(n.props.testID ?? ''),
        );
      for (const [, index] of lines) expect(index).toBeGreaterThan(firstRow);
      expect(firstRow).toBeGreaterThan(header);
      expect(lines.length).toBeLessThanOrEqual(1);
      void list;
      await act(async () => r.unmount());
    },
  );
});

describe('P2-15: community funding chooses a state from chips', () => {
  test('All and the eight states and territories, in the export’s codes', () => {
    expect(STATE_CHOICES.map(([, label]) => label)).toEqual([
      'All',
      'NSW',
      'Vic',
      'Qld',
      'WA',
      'SA',
      'Tas',
      'ACT',
      'NT',
    ]);
    expect(inState('VIC', 'VIC')).toBe(true);
    expect(inState('vic ', 'VIC')).toBe(true);
    expect(inState('NSW', 'VIC')).toBe(false);
    expect(inState('', 'all')).toBe(true);
  });
  test('no free-text code field; a chip narrows the projects', async () => {
    const r = await render(Allocation);
    expect(
      r.root
        .findAllByType(Field)
        .map((f) => f.props.label as string)
        .some((label) => /code/i.test(label)),
    ).toBe(false);
    const chips = r.root
      .findAllByType(ChoiceChips)
      .find((c) => c.props.segments.length === STATE_CHOICES.length)!;
    expect(chips.props.value).toBe('all');
    const awards = decodeAllocation(raw('/research/mlci.json')).awards;
    const vic = awards.filter((a) => inState(a.state, 'VIC')).length;
    expect(vic).toBeGreaterThan(0);
    expect(vic).toBeLessThan(awards.length);
    const count = () =>
      r.root
        .findAllByType(NativeText)
        .map((t) => [t.props.children].flat(3).join(''))
        .join('\n')
        .match(/(\d[\d,]*) project records/)?.[1];
    expect(count()).toBe(awards.length.toLocaleString('en-AU'));
    await act(async () => chips.props.onChange('VIC'));
    expect(count()).toBe(vic.toLocaleString('en-AU'));
    await act(async () => r.unmount());
  });
});

describe('P3-12: months by name and dates in words', () => {
  test('the pager names both months; an end names the month beside it, disabled', async () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('latest', 1)).toBeUndefined();
    const r = await render(Largest);
    const steps = r.root.findByType(StepButtons);
    const { previous, next } = steps.props;
    expect(previous.disabled).toBe(false);
    expect(previous.label).not.toMatch(/month/);
    expect(previous.accessibilityLabel).toMatch(
      /^Previous month, [A-Z][a-z]+ \d{4}$/,
    );
    // The export's latest month is the newest: the next one has no records.
    expect(next.disabled).toBe(true);
    expect(next.label).not.toMatch(/Next month/);
    expect(next.label).toMatch(/^[A-Z][a-z]+( \d{4})?$/);
    expect(next.accessibilityLabel).toMatch(
      /^Next month, [A-Z][a-z]+ \d{4}, no records$/,
    );
    await act(async () => r.unmount());
  });
  test('a list’s notes say dates in words, never ISO dates', async () => {
    expect(readableDates('awards published 2011-03-30 to 2028-05-01')).toBe(
      'awards published 30 Mar 2011 to 1 May 2028',
    );
    expect(readableDates(null)).toBeNull();
    mockParams.jur = 'federal';
    let r = await render(Grants);
    const grants = source(r.root, 'grants-source')!;
    const notes = (grants.props.notes as unknown[]).filter(
      (n): n is string => typeof n === 'string',
    );
    expect(notes.join('\n')).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(notes.join('\n')).toMatch(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
    await act(async () => r.unmount());
    Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
    r = await render(Program);
    const program = source(r.root, 'program-notes')!;
    expect(
      (program.props.notes as unknown[])
        .filter((n): n is string => typeof n === 'string')
        .join('\n'),
    ).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    await act(async () => r.unmount());
  });
});

describe('P3-3: money figures take the money accent', () => {
  test.each([
    ['Largest', Largest, {}],
    ['Allocation', Allocation, {}],
  ] as const)('%s rows draw their amount in moneyInk', async (_n, Screen) => {
    const r = await render(Screen);
    const money = r.root
      .findAllByType(Text)
      .filter((t) => t.props.tone === 'moneyInk');
    expect(money.length).toBeGreaterThan(0);
    for (const t of money)
      expect(String([t.props.children].flat().join(''))).toMatch(/^\$/);
    await act(async () => r.unmount());
  });
});
