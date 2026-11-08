import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { router } from 'expo-router';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import type { ApiClient, RecordResult } from '../src/api/client';
import { money } from '../src/features/money-public/runtime';
import {
  BigFigure,
  LinkRow,
  Section,
  SectionHeader,
  SourceLine,
} from '../src/design/primitives';
import { FigureBlock } from '../src/design/record';
import { SeatGrants as FromGrants } from '../src/features/money-public/Grants';
import {
  SEAT_CAVEAT,
  SEAT_RULE,
  SeatGrants,
  noSeatMatch,
} from '../src/features/money-public/SeatGrants';
import { decodeGrantIndex } from '../src/features/money-public/data';
import { formatCount, formatMoneyCompact } from '../src/design/format';

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
    router: { push: jest.fn() },
  };
});
jest.mock('../src/features/money-public/runtime', () => ({ money: {} }));
jest.mock('../src/api/runtime', () => ({
  catalogs: { directory: jest.fn() },
}));
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
const index = decodeGrantIndex(raw('/graph/grants.federal.json'));
const seat = [...index.seats].sort((a, b) => b.total - a.total)[0]!;
beforeEach(() => {
  money.grants = fixture.grants.bind(fixture) as never;
  jest.mocked(router.push).mockClear();
});
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
  return r;
}
const byID = (root: ReactTestInstance, testID: string) =>
  root.findAll((n) => n.props.testID === testID && typeof n.type !== 'string');

describe('SeatGrants with no variant renders exactly as before', () => {
  test('Grants.tsx still exports it', () => {
    expect(FromGrants).toBe(SeatGrants);
  });
  test('the section, figure, source line and both rows, as drawn before', async () => {
    const r = await render(<SeatGrants name={seat.name} state={seat.state} />);
    const section = r.root.findByType(Section);
    expect(section.props).toMatchObject({
      title: 'Grants in this seat',
      accent: 'money',
      testID: 'seat-grants',
    });
    const figure = r.root.findByType(BigFigure);
    expect(figure.props).toMatchObject({
      value: formatMoneyCompact(seat.total),
      label: `In ${formatCount(seat.count)} Commonwealth grants`,
      accent: 'money',
      testID: 'seat-grants-total',
    });
    const source = r.root.findByType(SourceLine);
    expect(source.props.title).toBe('About grants in this seat');
    expect(source.props.testID).toBe('seat-grants-source');
    expect(source.props.notes.at(-1)).toBe(
      'Electorate mappings are approximate and use the award’s delivery or recipient postcode.',
    );
    expect(source.props.licence).toBe(index.meta.licence);
    const rows = r.root.findAllByType(LinkRow);
    expect(rows.map((row) => [row.props.title, row.props.testID])).toEqual([
      ['See all', 'seat-grants-all'],
      ['Public money', 'seat-public-money'],
    ]);
    await act(async () => rows[0]!.props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/grants',
      params: {
        jur: 'federal',
        seat: seat.name,
        state: seat.state,
        view: 'electorates',
      },
    });
    await act(async () => rows[1]!.props.onPress());
    expect(router.push).toHaveBeenLastCalledWith('/public-money');
    expect(r.root.findAllByType(FigureBlock)).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('an ineligible seat keeps the old sentence and rows', async () => {
    const r = await render(
      <SeatGrants name={seat.name} state={seat.state} eligible={false} />,
    );
    expect(r.root.findAllByType(BigFigure)).toHaveLength(0);
    const text = r.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(text).toContain(
      'No matching federal division in the grant records. This is not a zero total.',
    );
    expect(
      r.root.findAllByType(LinkRow).map((row) => row.props.testID),
    ).toEqual(['seat-grants-all', 'seat-public-money']);
    await act(async () => r.unmount());
  });
  test('an unmatched seat says it is not a zero total', async () => {
    const r = await render(<SeatGrants name="Nowhere" state="NSW" />);
    const text = r.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(text).toContain(
      'No matching federal division in the grant records. This is not a zero total.',
    );
    await act(async () => r.unmount());
  });
});

describe('SeatGrants variant="seat-home"', () => {
  test('"Grants in {seat}", the span line, the minimum caveat, no action before D5', async () => {
    const r = await render(
      <SeatGrants name={seat.name} state={seat.state} variant="seat-home" />,
    );
    const header = r.root.findByType(SectionHeader);
    expect(header.props.title).toBe(`Grants in ${seat.name}`);
    expect(header.props.action).toBeUndefined();
    const figure = r.root.findByType(FigureBlock);
    expect(figure.props.testID).toBe('seat-grants-total');
    expect(figure.props.ink).toBe('money');
    expect(figure.props.label).toMatch(
      new RegExp(
        `^in ${formatCount(seat.count)} Commonwealth grants?, \\d{4}–\\d{2} to \\d{4}–\\d{2}$`,
      ),
    );
    expect(figure.props.caveat).toBe(SEAT_CAVEAT);
    expect(figure.props.source.notes[0]).toBe(SEAT_RULE);
    expect(figure.props.source.notes[1]).toMatch(/postcode/);
    expect(figure.props.source.testID).toBe('seat-grants-source');
    // Nothing onward and nothing national until the per-seat slice ships.
    expect(byID(r.root, 'seat-grants-all')).toHaveLength(0);
    expect(byID(r.root, 'seat-public-money')).toHaveLength(0);
    expect(r.root.findAllByType(LinkRow)).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('an unmatched seat draws the sentence and its source line', async () => {
    const r = await render(
      <SeatGrants name="Nowhere" state="nsw" variant="seat-home" />,
    );
    expect(byID(r.root, 'seat-grants-unmatched')[0]!.props.children).toBe(
      noSeatMatch('Nowhere'),
    );
    expect(r.root.findAllByType(SourceLine).length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
  test('a seat that is not a federal division draws no block at all', async () => {
    const r = await render(
      <SeatGrants
        name={seat.name}
        state={seat.state}
        eligible={false}
        variant="seat-home"
      />,
    );
    expect(r.toJSON()).toBeNull();
    expect(byID(r.root, 'seat-grants')).toHaveLength(0);
    await act(async () => r.unmount());
  });
  test('a failed read is an inline error, not a blank block', async () => {
    money.grants = jest.fn(async () => {
      throw new Error('offline');
    }) as never;
    const r = await render(
      <SeatGrants name={seat.name} state={seat.state} variant="seat-home" />,
    );
    expect(byID(r.root, 'seat-grants-error').length).toBeGreaterThan(0);
    await act(async () => r.unmount());
  });
});
