import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import {
  Dimensions,
  Platform,
  StyleSheet,
  Text as NativeText,
} from 'react-native';
import { catalogs } from '../src/api/runtime';
import {
  decodeElectorate,
  electorateFor,
  yourMPFor,
} from '../src/api/catalogs';
import { InsetGroup } from '../src/design/layout';
import { PersonRow } from '../src/design/people';
import { yourMPSources } from '../src/features/today/YourMPCard';
import {
  LatestRows,
  type LatestRecord,
} from '../src/features/your-mp/LatestRows';
import { RepresentativesGroup } from '../src/features/your-mp/RepresentativesGroup';
import { breaksMidWord } from '../src/design/text';
import { textRampScale } from '../src/design/text-scale';
import { textStyles } from '../src/design/tokens';
import { textWidth } from './row-layout';
import { index, manifest, people, pinned, roster, slugs } from './pinned';

jest.mock('../src/api/runtime', () => ({
  catalogs: {
    yourMP: jest.fn(),
    electorateFor: jest.fn(),
    profileFor: jest.fn(),
    bills: jest.fn(),
  },
  portraits: { get: jest.fn(async () => null) },
}));
jest.mock('../src/features/CachedPortrait', () => ({
  CachedPortrait: () => null,
}));
jest.mock('../src/design/row-link', () => ({
  ...jest.requireActual('../src/design/row-link'),
  RowLink: ({ children }: { children: React.ReactNode }) => children,
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const seat = index.electorates.find((row) => row.name === 'Grayndler')!;
const directory = {
  manifest: result(manifest),
  people: result(people),
  roster: result(roster),
  slugs: result(slugs),
  electorates: result(index),
};
const view = yourMPFor(seat.electorate_id, index, manifest);
const electorate = electorateFor(decodeElectorate(pinned(seat.detail_url)));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(catalogs.yourMP).mockResolvedValue(view);
  jest.mocked(catalogs.electorateFor).mockResolvedValue(result(electorate));
  jest.mocked(catalogs.profileFor).mockRejectedValue(new Error('Unavailable'));
  jest.mocked(catalogs.bills).mockRejectedValue(new Error('Unavailable'));
});

// Today's representatives group has its own file: today-reps.test.tsx.

test('Your MP keeps the recorded member when their profile cannot be linked', async () => {
  const unlinked = { ...directory, slugs: result({ ...slugs, slugs: {} }) };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <RepresentativesGroup
        seat={seat}
        directory={unlinked}
        view={view}
        electorate={electorate}
      />,
    );
  });
  const member = view.members.data![0]!;
  const row = renderer.root
    .findAllByType(PersonRow)
    .find((node) => node.props.name === member.person.name);
  expect(row).toBeDefined();
  expect(row!.props.href).toBeUndefined();
  expect(row!.props.party).toBe(member.party);
  expect(
    renderer.root.findAllByProps({ testID: 'your-member-none' }),
  ).toHaveLength(0);
  await act(async () => renderer.unmount());
});

test('Today cites the House roster alone, dated and labelled as saved when it is', () => {
  const source = yourMPSources({
    ...view,
    members: {
      ...view.members,
      asAt: '2026-11-10',
      stale: true,
      savedAt: 123,
      sources: [
        { label: 'Fixture House roster', url: 'https://example.org/house' },
      ],
    },
    senators: [
      {
        ...view.senators[0]!,
        asAt: '2026-10-01',
        sources: [
          {
            label: 'Fixture Senate roster',
            url: 'https://example.org/senate',
          },
        ],
      },
    ],
  });
  // The senators have only a link on Today, so their roster is not cited.
  expect(source.asOf).toBe('2026-11-10');
  expect(source.citation).toEqual([
    { label: 'Fixture House roster', asOf: '2026-11-10' },
  ]);
  expect(source.originals).toEqual([
    {
      label: 'Fixture House roster',
      url: 'https://example.org/house',
      asOf: '2026-11-10',
    },
  ]);
  expect(source.state).toBe('saved');
  expect(source.savedAt).toBe(123);
  expect(yourMPSources(view).state).toBeNull();
});

test('Latest shows a long gift title in full words, never cut at 79 characters', async () => {
  // Build 61 on an iPhone Duo: "…provided by Endeavou…" on the Today card
  // (the rows now live on Your MP and the profile).
  const title =
    'Fixture Cup Final: hospitality and a ticket to the match on 26/09/26 provided by Fixture Hospitality Group';
  expect(title.length).toBeGreaterThan(80);
  const records = [
    {
      key: 'register-fixture',
      kind: 'register',
      date: '2026-09-28',
      action: 'Declared a gift',
      title,
      detail: '',
      url: 'https://example.invalid/register',
    },
  ] as unknown as LatestRecord[];
  // Default text size: at accessibility sizes the title runs in full.
  const dimensions = jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 951, height: 669, scale: 3, fontScale: 1 });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <InsetGroup>
        <LatestRows records={records} testID="your-mp-latest" />
      </InsetGroup>,
    );
  });
  const node = renderer.root.findAll(
    (n) =>
      typeof n.type === 'string' && n.props.testID === 'your-mp-latest-0-title',
  )[0];
  expect(node).toBeDefined();
  expect(node!.props.children).toBe(title);
  expect(node!.props.numberOfLines).toBeGreaterThanOrEqual(3);
  await act(async () => renderer.unmount());
  dimensions.mockRestore();
});

// Exercise LatestRows' mounted Text, not just an isolated wordSafe example,
// on the narrow Duo column.
test.each([
  ['AX3', 2.643],
  ['AX5', 3.571],
] as const)(
  '%s: the existing Your MP vote title fitting keeps words whole on Duo',
  async (_size, fontScale) => {
    const window = Dimensions.get('window');
    const platform = jest.replaceProperty(Platform, 'OS', 'ios');
    const title =
      'Online Safety Amendment (Strengthening Enforcement for the Social Media Minimum Age) Bill 2026 amendment';
    const records = [
      {
        key: 'vote-fixture',
        kind: 'vote',
        date: '2026-09-28',
        action: 'Voted for',
        title,
        detail: 'Third reading',
        url: 'https://example.invalid/vote',
      },
    ] as unknown as LatestRecord[];
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        Dimensions.set({
          window: { ...window, width: 402, height: 678, fontScale },
        });
        renderer = TestRenderer.create(
          <InsetGroup>
            <LatestRows records={records} testID="your-mp-latest" />
          </InsetGroup>,
        );
      });
      const text = () =>
        renderer.root
          .findAllByType(NativeText)
          .find((node) => node.props.testID === 'your-mp-latest-0-title')!;
      expect(text()).toBeDefined();
      expect(text().props.numberOfLines).toBeUndefined();
      const column = 110;
      const ramp =
        textRampScale(textStyles.rowRecord.dynamicTypeRamp, fontScale) ?? 1;
      let lines: { text: string; width: number; height: number }[] = [];
      let lastSize = 0;
      for (let step = 0; step < 40; step++) {
        const style = StyleSheet.flatten(text().props.style);
        const size = style.fontSize * ramp;
        if (size === lastSize) break;
        lastSize = size;
        const height = style.lineHeight * ramp;
        lines = [];
        let line = '';
        const push = () => {
          lines.push({
            text: line,
            width: textWidth(line.trimEnd(), size),
            height,
          });
          line = '';
        };
        for (const word of title.split(/(?<= )/)) {
          if (textWidth((line + word).trimEnd(), size) <= column) {
            line += word;
            continue;
          }
          if (line) push();
          for (const glyph of word) {
            if (line && textWidth((line + glyph).trimEnd(), size) > column)
              push();
            line += glyph;
          }
        }
        if (line) push();
        act(() =>
          text().props.onLayout({
            nativeEvent: {
              layout: {
                x: 0,
                y: 0,
                width: column,
                height: lines.length * height,
              },
            },
          }),
        );
        act(() => text().props.onTextLayout({ nativeEvent: { lines } }));
      }
      expect(lines.map((line) => line.text).join('')).toBe(title);
      expect(breaksMidWord(lines)).toBe(false);
      // This word still cannot fit at the default 17pt size; the inherited
      // step-down must continue below it rather than stopping at cap 1.
      expect(lastSize).toBeLessThan(textStyles.rowRecord.fontSize);
      expect(lastSize).toBeGreaterThanOrEqual(10.8);
    } finally {
      await act(async () => {
        renderer?.unmount();
        Dimensions.set({ window });
      });
      platform.restore();
    }
  },
);
