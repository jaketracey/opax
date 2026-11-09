import { router } from 'expo-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import type { ApiClient, RecordResult } from '../src/api/client';
import { formatCount } from '../src/design/format';
import { LinkRow, SectionHeader, SourceLine } from '../src/design/primitives';
import { FigureBlock } from '../src/design/record';
import {
  SEAT_CAVEAT,
  SEAT_RULE,
  SeatGrants,
  noSeatMatch,
} from '../src/features/money-public/SeatGrants';
import { MoneyCatalogs } from '../src/features/money-public/catalog';
import { decodeGrantIndex } from '../src/features/money-public/data';
import { money } from '../src/features/money-public/runtime';

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

describe('SeatGrants defaults to the seat home variant', () => {
  test('an unmatched seat says it is not a zero total', async () => {
    const r = await render(<SeatGrants name="Nowhere" state="NSW" />);
    const text = r.root
      .findAll((n) => typeof n.props.children === 'string')
      .map((n) => n.props.children as string);
    expect(text).toContain(
      'No grants are matched to Nowhere in the grant records. This is not a zero total.',
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
    expect(figure.props.citation.notes[0]).toBe(SEAT_RULE);
    expect(figure.props.citation.notes[1]).toMatch(/postcode/);
    expect(figure.props.citation.testID).toBe('seat-grants-source');
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
