import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { money } from '../src/features/money-public/runtime';
import { SegmentedPicker } from '../src/design/controls';
import { MoneyRow } from '../src/design/rows';
import * as d from '../src/features/money-public/data';
import Grants from '../src/features/money-public/Grants';
import Program from '../src/features/money-public/Program';
import { Agency } from '../src/features/money-public/Agencies';
import { loadMoneyItem } from '../src/features/money-public/MoneyItem';
import {
  privateNote,
  unnamedRecipient,
  unnamedSupplier,
} from '../src/features/money-public/privacy';
import { moneyFromWebPath } from '../src/features/money-public/routes';
import { formatMoney } from '../src/design/format';

// Individuals are never named in a money list (journeys/money.md 12,
// App Review 5.1.1): their records are counted in a footnote, their pages
// say "Individual recipient" and carry "OPAX doesn’t name private
// individuals.", and no route is addressed by a private name.
const mockParams: Record<string, string> = {};
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
    router: { push: jest.fn(), setParams: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    directory: jest.fn(async () => {
      throw new Error('offline');
    }),
    discovery: jest.fn(async () => {
      throw new Error('offline');
    }),
  },
}));
jest.mock('@shopify/react-native-skia', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Canvas: require('react-native').View,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Rect: (props: object) => require('react').createElement('Rect', props),
}));
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
const raw = (path: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, '../../portal/public' + path), 'utf8'),
  );
const PRIVATE = 'Ada Privacy Example';
/** The exports, with one private person written into each list. */
function privateClient(): Pick<ApiClient, 'get'> {
  return {
    async get<T>(
      path: string,
      decode: (v: unknown) => T,
    ): Promise<RecordResult<T>> {
      const input = raw(path);
      if (path.includes('/programs/'))
        input.grants[0] = {
          ...input.grants[0],
          rn: PRIVATE,
          k: 'individual',
          rid: 'person:ada',
          n: `Grant for ${PRIVATE}`,
        };
      if (path.startsWith('/agencies/')) {
        input.suppliers[0] = {
          ...input.suppliers[0],
          name: PRIVATE,
          entity_type: 'individual',
        };
        input.contracts[0] = {
          ...input.contracts[0],
          supplier: PRIVATE,
          supplier_id: input.suppliers[0].id,
          title: `Services by ${PRIVATE}`,
          entity_type: 'individual',
        };
      }
      return { data: decode(input), stale: false, savedAt: 10, asOf: null };
    },
  };
}
beforeEach(() => {
  Object.keys(mockParams).forEach((k) => delete mockParams[k]);
  const catalog = new MoneyCatalogs(privateClient());
  for (const name of [
    'grants',
    'notes',
    'program',
    'agencies',
    'agency',
  ] as const)
    money[name] = catalog[name].bind(catalog) as never;
});

async function mount(Screen: () => React.ReactNode) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(createElement(Screen));
  });
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
  return r;
}
const note = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (n) => n.props.testID === testID && typeof n.type !== 'string',
  )[0]?.props.children as string | undefined;

describe('lists never name an individual', () => {
  test('the grant index marks every person id as an individual', () => {
    const index = d.decodeGrantIndex(raw('/graph/grants.federal.json'));
    const people = index.recipients.filter((r) => r.id.startsWith('person:'));
    expect(people.length).toBeGreaterThan(0);
    for (const r of people) {
      expect(r.organisation).toBe(false);
      expect(r.name).toBe(unnamedRecipient);
    }
  });
  test('Recipients lists organisations only, with individuals as a footnote', async () => {
    mockParams.jur = 'federal';
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(createElement(Grants));
    });
    await act(async () => {
      await new Promise((done) => setTimeout(done, 0));
    });
    await act(async () =>
      r.root.findByType(SegmentedPicker).props.onChange('recipients'),
    );
    const names = r.root
      .findAllByType(MoneyRow)
      .map((row) => row.props.name as string);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(unnamedRecipient);
    const index = d.decodeGrantIndex(raw('/graph/grants.federal.json'));
    const people = index.recipients.filter((p) => !p.organisation);
    const note = r.root.findAll(
      (n) =>
        n.props.testID === 'grants-individuals' && typeof n.type !== 'string',
    )[0]!;
    expect(note.props.children).toBe(
      `${people.length.toLocaleString('en-AU')} individual recipients, ${formatMoney(
        people.reduce((s, p) => s + p.total, 0),
      )}, not named.`,
    );
    await act(async () => r.unmount());
  });
  test('a program lists organisations; grants to individuals are a footnote', async () => {
    Object.assign(mockParams, { jur: 'federal', id: 'GO3141' });
    const r = await mount(Program);
    const names = r.root
      .findAllByType(MoneyRow)
      .map((row) => row.props.name as string);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(unnamedRecipient);
    expect(names).not.toContain(PRIVATE);
    expect(note(r, 'program-individuals')).toMatch(
      /^1 grant to individual recipients, \$[\d,]+, not named\.$/,
    );
    // On Grants the individual's grant is a record row, unnamed.
    await act(async () =>
      r.root.findByType(SegmentedPicker).props.onChange('grants'),
    );
    expect(
      r.root.findAllByType(MoneyRow).map((row) => row.props.name),
    ).toContain(unnamedRecipient);
    expect(
      r.root.findAll((n) => n.props.testID === 'program-individuals'),
    ).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('an agency lists organisation suppliers; individuals are a footnote', async () => {
    Object.assign(mockParams, {
      id: 'a-7431f054588d4251c0b4',
      section: 'suppliers',
    });
    const r = await mount(Agency);
    const names = r.root
      .findAllByType(MoneyRow)
      .map((row) => row.props.name as string);
    expect(names.length).toBeGreaterThan(0);
    expect(names).not.toContain(unnamedSupplier);
    expect(names).not.toContain(PRIVATE);
    expect(note(r, 'agency-individuals')).toMatch(
      /^[\d,]+ individual suppliers?, \$[\d,]+, not named\.$/,
    );
    // Their contracts stay under Contracts, as "Individual supplier".
    await act(async () =>
      r.root.findByType(SegmentedPicker).props.onChange('contracts'),
    );
    expect(
      r.root.findAllByType(MoneyRow).map((row) => row.props.name),
    ).toContain(unnamedSupplier);
    await act(async () => r.unmount());
  });
  test('allocation recipients that are people are not named', () => {
    const input = raw('/research/mlci.json');
    input.awards[0] = {
      ...input.awards[0],
      recipient: PRIVATE,
      entity_type: 'individual',
    };
    const award = d.decodeAllocation(input).awards[0]!;
    expect(award.recipient).toBe(unnamedRecipient);
    expect(award.title).toBe('Grant project');
  });
});

describe('a person’s record page', () => {
  test('a grant to a person says "Individual recipient" and why', async () => {
    const program = raw('/grants/federal/programs/go3141.json');
    const item = (
      await loadMoneyItem(
        {
          kind: 'grant',
          jur: 'federal',
          program: program.key,
          id: program.grants[0].id,
        },
        false,
      )
    ).data;
    expect(item.name).toBe(unnamedRecipient);
    expect(item.individual).toBe(true);
    expect(item.notes).toContain(privateNote);
    expect(JSON.stringify(item)).not.toContain(PRIVATE);
    expect(item.onward.map((o) => o.key)).not.toContain('organisation');
  });
  test('a program’s individual recipients are one record, addressed without a name', async () => {
    const program = raw('/grants/federal/programs/go3141.json');
    const item = (
      await loadMoneyItem(
        {
          kind: 'recipient',
          jur: 'federal',
          program: program.key,
          recipient: 'individuals',
        },
        false,
      )
    ).data;
    expect(item.name).toBe('Individual recipients');
    expect(item.notes).toContain(privateNote);
    expect(JSON.stringify(item)).not.toContain(PRIVATE);
  });
  test('a contract with a person says "Individual supplier" and has no web page', async () => {
    const agency = 'a-7431f054588d4251c0b4';
    const id = raw(`/agencies/${agency}.json`).contracts[0].id;
    const item = (await loadMoneyItem({ kind: 'contract', agency, id }, false))
      .data;
    expect(item.name).toBe(unnamedSupplier);
    expect(item.notes).toContain(privateNote);
    expect(item.path).toBeNull();
    expect(JSON.stringify(item)).not.toContain(PRIVATE);
  });
  test('the note is said in plain words', () => {
    expect(privateNote).toBe('OPAX doesn’t name private individuals.');
  });
});

describe('no route is addressed by a private name', () => {
  test.each([
    '/money/grants/federal/recipient/person%3Aada',
    '/money/grants?open=person%3Aada',
  ])('%s does not open', (path) => expect(moneyFromWebPath(path)).toBeNull());
});
