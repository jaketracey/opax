import { act } from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  decodeElectorate,
  decodeElectorateIndex,
  electorateFor,
} from '../src/api/catalogs';
import { Icon } from '../src/design/icon';
import { PartyLabel } from '../src/design/people';
import { symbols } from '../src/design/symbols';
import { rhythm } from '../src/design/tokens';
import { OutlineMap } from '../src/features/electorate-map/OutlineMap';
import {
  ElectorateCard,
  electorateCardSource,
} from '../src/features/your-mp/ElectorateCard';
import { pinned } from './pinned';

jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  RowLink: ({ children }: { children: React.ReactNode }) => children,
}));

const manifest = pinned('/electorates/manifest.json') as { index_url: string };
const index = decodeElectorateIndex(pinned(manifest.index_url));
const seat = index.electorates.find((item) => item.name === 'Grayndler')!;
const view = electorateFor(decodeElectorate(pinned(seat.detail_url)));

test('the card cites the Census and election it actually displays, regardless of file order or update date', () => {
  const census = view.census.find((block) => block.data)!;
  const election = view.elections.find((block) => block.data)!;
  const latest = {
    ...election,
    asAt: '2025-05-03',
    sources: [
      {
        label: 'Fixture latest election',
        url: 'https://example.org/latest-election',
      },
    ],
    data: {
      ...election.data!,
      election: { ...election.data!.election, poll_date: '2025-05-03' },
    },
  };
  const source = electorateCardSource(seat, {
    ...view,
    census: [
      {
        ...census,
        asAt: '2016-08-09',
        data: { ...census.data!, year: 2016 },
        sources: [
          {
            label: 'Fixture old Census',
            url: 'https://example.org/old-census',
          },
        ],
      },
      {
        ...census,
        asAt: '2021-08-10',
        data: { ...census.data!, year: 2021 },
        sources: [
          {
            label: 'Fixture latest Census',
            url: 'https://example.org/latest-census',
          },
        ],
      },
    ],
    elections: [
      {
        ...election,
        asAt: '2026-10-01',
        data: {
          ...election.data!,
          election: { ...election.data!.election, poll_date: '2022-05-21' },
        },
        sources: [
          {
            label: 'Fixture old election',
            url: 'https://example.org/old-election',
          },
        ],
      },
      latest,
    ],
  });
  expect(source.citation).toEqual([
    expect.objectContaining({ label: 'AEC', asOf: latest.asAt }),
    expect.objectContaining({
      label: 'ABS',
      title: 'ABS Census 2021',
      asOf: '2021-08-10',
    }),
  ]);
  expect(source.originals?.map((original) => original.url)).toEqual([
    'https://example.org/latest-election',
    'https://example.org/latest-census',
  ]);
  expect(source.notes?.join(' ')).toContain('2021 Census');
});

test.each([true, false])(
  'the electorate disclosure uses the full trailing edge, with outline %s',
  (outline) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ElectorateCard
          seat={seat}
          view={{ ...view, boundaries: outline ? view.boundaries : [] }}
        />,
      );
    });
    try {
      expect(
        renderer.root
          .findAllByType(Icon)
          .filter((node) => node.props.name === symbols.chevron),
      ).toHaveLength(1);
      const election = renderer.root.findAllByType(View).find((node) => {
        const style = StyleSheet.flatten(node.props.style);
        return (
          style?.flexDirection === 'row' && style.alignItems === 'flex-end'
        );
      })!;
      expect(StyleSheet.flatten(election.props.style)).toMatchObject({
        flexDirection: 'row',
        alignItems: 'flex-end',
      });
      const body = renderer.root
        .findAllByType(View)
        .find(
          (node) =>
            StyleSheet.flatten(node.props.style)?.padding === rhythm.block,
        )!;
      const copy = election
        .findAllByType(View)
        .find((node) => StyleSheet.flatten(node.props.style)?.flex === 1)!;
      expect(StyleSheet.flatten(copy.props.style)).toMatchObject({ flex: 1 });
      expect(StyleSheet.flatten(body.props.style)).toMatchObject({
        padding: rhythm.block,
        ...(outline ? { paddingTop: 0 } : {}),
      });
      expect(renderer.root.findAllByType(OutlineMap)).toHaveLength(
        outline ? 1 : 0,
      );
    } finally {
      act(() => renderer.unmount());
    }
  },
);

test.each([
  ['ALP', 'Labor', 'Labor'],
  [null, 'Party not recorded', null],
])(
  'the card names the winner party (%s), never a code',
  (party, spoken, shown) => {
    const block = view.elections.find((b) => b.data)!;
    const data = block.data!;
    const winner = {
      ...data.candidates[0]!,
      name: 'Fixture Winner',
      party,
      elected: true,
    };
    const elections = [
      {
        ...block,
        data: {
          ...data,
          candidates: [
            winner,
            ...data.candidates.slice(1).map((c) => ({ ...c, elected: false })),
          ],
        },
      },
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ElectorateCard seat={seat} view={{ ...view, elections }} />,
      );
    });
    try {
      const card = renderer.root.find(
        (node) => node.props.testID === 'your-electorate',
      );
      expect(card.props.accessibilityLabel).toContain(
        `Fixture Winner, ${spoken}, `,
      );
      expect(renderer.root.findByType(PartyLabel).props.party).toBe(shown);
    } finally {
      act(() => renderer.unmount());
    }
  },
);
