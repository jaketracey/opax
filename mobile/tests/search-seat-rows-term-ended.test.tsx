import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import type { Electorate } from '../src/api/catalog-decoders';
import { Text } from '../src/design/text';
import { matchItem } from '../src/features/quick-search/items';
import { MatchRow } from '../src/features/search/rows';
import { index, people, roster } from './pinned';

jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('../src/features/your-mp/useSetAsMyElectorate', () => ({
  useSetAsMyElectorate: () => ({ visible: false, label: '', run: jest.fn() }),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useSegments: () => [],
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

// The live index: every Assembly row carries the election day, or null once
// the result is loaded; Council rows carry nothing (s 28(2) covers them).
const indexWith = (value: string | null) => ({
  ...index,
  electorates: index.electorates.map((s) =>
    s.chamber === 'vic_la' ? { ...s, dissolved_for: value } : s,
  ),
});
const sourcesWith = (value: string | null) => ({
  roster,
  people,
  electorates: indexWith(value),
});
const seatsOf = (value: string | null) => {
  const all = indexWith(value).electorates;
  return {
    district: all.find(
      (s) =>
        s.chamber === 'vic_la' &&
        s.status !== 'historical' &&
        s.representatives.length === 1,
    )!,
    region: all.find(
      (s) => s.chamber === 'vic_lc' && s.representatives.length > 1,
    )!,
    federal: all.find((s) => s.name === 'Grayndler')!,
  };
};
const names = (seat: Electorate) =>
  seat.representatives.map((r) => r.person.name).join(', ');
const drawnSeat = (
  seat: Electorate,
  sources: ReturnType<typeof sourcesWith>,
) => {
  const match = {
    kind: 'electorates',
    key: seat.electorate_id,
    tier: 0,
    item: seat,
  } as const;
  const row = (variant: 'result' | 'suggestion') => {
    let view!: TestRenderer.ReactTestRenderer;
    act(() => {
      view = TestRenderer.create(
        <MatchRow
          match={match}
          q="x"
          sources={sources}
          variant={variant}
          testID="seat-row"
        />,
      );
    });
    const host = view.root.find(
      (n) => typeof n.type === 'string' && n.props.testID === 'seat-row',
    );
    const text = view.root
      .findAllByType(Text)
      .map((n) => [n.props.children].flat(Infinity).join(''))
      .join(' | ');
    const spoken = String(host.props.accessibilityLabel ?? '');
    act(() => view.unmount());
    return { text, spoken };
  };
  return {
    rows: [row('result'), row('suggestion')],
    quick: matchItem(match, sources).secondary,
  };
};

describe('a seat’s search row while the Victorian Parliament’s term has ended', () => {
  test('says "Last member:" or "Last members:", drawn and spoken, in Search and quick search', () => {
    const sources = sourcesWith('2026-11-28');
    const { district, region, federal } = seatsOf('2026-11-28');
    const one = drawnSeat(district, sources);
    const line = `Last member: ${names(district)}`;
    expect(one.quick).toBe(line);
    for (const row of one.rows) {
      expect(row.text).toContain(`Victoria · ${line}`);
      expect(row.spoken).toContain(`Victoria · ${line}`);
    }
    expect(region.representatives.length).toBe(5);
    const five = drawnSeat(region, sources);
    const lines = `Last members: ${names(region)}`;
    expect(five.quick).toBe(lines);
    for (const row of five.rows) {
      expect(row.text).toContain(`Victoria · ${lines}`);
      expect(row.spoken).toContain(`Victoria · ${lines}`);
    }
    // A federal seat keeps its member.
    const fed = drawnSeat(federal, sources);
    expect(fed.quick).toBe('Anthony Albanese');
    expect(fed.rows[0]!.text).toContain('New South Wales · Anthony Albanese');
    expect(fed.rows[0]!.text).not.toContain('Last member');
  });

  test('once the result is loaded (null) the rows name members again', () => {
    const sources = sourcesWith(null);
    const { district, region } = seatsOf(null);
    for (const seat of [district, region]) {
      const drawn = drawnSeat(seat, sources);
      expect(drawn.quick).toBe(names(seat));
      for (const row of drawn.rows) {
        expect(row.text).toContain(`Victoria · ${names(seat)}`);
        expect(row.text).not.toContain('Last member');
        expect(row.spoken).not.toContain('Last member');
      }
    }
  });
});
