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
  profileFor,
  yourMPFor,
} from '../src/api/catalogs';
import { PersonRow } from '../src/design/people';
import { YourMPCard, yourMPSources } from '../src/features/today/YourMPCard';
import type { LatelyState } from '../src/features/your-mp/latest';
import { RepresentativesGroup } from '../src/features/your-mp/RepresentativesGroup';
import { breaksMidWord } from '../src/design/text';
import { textRampScale } from '../src/design/text-scale';
import { textStyles } from '../src/design/tokens';
import { textWidth } from './row-layout';
import {
  catalogs as fixtureCatalogs,
  index,
  manifest,
  people,
  pinned,
  roster,
  slugs,
} from './pinned';

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
let mockLately: LatelyState | null = null;
jest.mock('../src/features/your-mp/latest', () => {
  const actual = jest.requireActual('../src/features/your-mp/latest');
  return {
    ...actual,
    latelyFor: (...args: Parameters<typeof actual.latelyFor>) =>
      mockLately ?? actual.latelyFor(...args),
  };
});
afterEach(() => {
  mockLately = null;
});

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
  jest.mocked(catalogs.yourMP).mockResolvedValue(view);
  jest.mocked(catalogs.electorateFor).mockResolvedValue(result(electorate));
  jest.mocked(catalogs.profileFor).mockRejectedValue(new Error('Unavailable'));
  jest.mocked(catalogs.bills).mockRejectedValue(new Error('Unavailable'));
});

test.each(['today', 'your-mp'])(
  '%s preserves the recorded member when their native profile cannot be linked',
  async (screen) => {
    const unlinked = { ...directory, slugs: result({ ...slugs, slugs: {} }) };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        screen === 'today' ? (
          <YourMPCard
            seat={seat}
            directory={unlinked}
            stateSeatIds={[]}
            attempt={0}
            onRetry={jest.fn()}
          />
        ) : (
          <RepresentativesGroup
            seat={seat}
            directory={unlinked}
            view={view}
            electorate={electorate}
          />
        ),
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
      renderer.root.findAllByProps({
        testID: screen === 'today' ? 'today-your-mp-none' : 'your-member-none',
      }),
    ).toHaveLength(0);
    await act(async () => renderer.unmount());
  },
);

test('Today dates its roster by the oldest record and labels a saved senator roster', () => {
  const source = yourMPSources(
    {
      ...view,
      members: {
        ...view.members,
        asAt: '2026-11-10',
        sources: [
          { label: 'Fixture House roster', url: 'https://example.org/house' },
        ],
      },
      senators: [
        {
          ...view.senators[0]!,
          asAt: '2026-10-01',
          stale: true,
          savedAt: 123,
          sources: [
            {
              label: 'Fixture Senate roster',
              url: 'https://example.org/senate',
            },
          ],
        },
      ],
    },
    { status: 'loading' },
    null,
  );
  expect(source.asOf).toBe('2026-10-01');
  expect(source.originals).toEqual([
    {
      label: 'Fixture House roster',
      url: 'https://example.org/house',
      asOf: '2026-11-10',
    },
    {
      label: 'Fixture Senate roster',
      url: 'https://example.org/senate',
      asOf: '2026-10-01',
    },
  ]);
  expect(source.state).toBe('saved');
  expect(source.savedAt).toBe(123);
});

test('Today labels saved vote, register and bill records even when the roster is fresh', () => {
  const profile = profileFor(view.members.data![0]!.person_id, fixtureCatalogs);
  for (const field of ['votes', 'interests'] as const) {
    const source = yourMPSources(
      view,
      {
        status: 'ready',
        data: {
          ...profile,
          blocks: {
            ...profile.blocks,
            [field]: { ...profile.blocks[field], stale: true, savedAt: 321 },
          },
        },
      },
      null,
    );
    expect(source.state).toBe('saved');
    expect(source.savedAt).toBe(321);
  }
  const source = yourMPSources(
    view,
    { status: 'loading' },
    { asOf: '2026-10-01', stale: true, savedAt: 456 },
  );
  expect(source.state).toBe('saved');
  expect(source.savedAt).toBe(456);
});

test('Today shows a long gift title in full words, never cut at 79 characters', async () => {
  // Build 61 on an iPhone Duo: "…provided by Endeavou…" on the Today card.
  const title =
    'Fixture Cup Final: hospitality and a ticket to the match on 26/09/26 provided by Fixture Hospitality Group';
  expect(title.length).toBeGreaterThan(80);
  mockLately = {
    status: 'ready',
    records: [
      {
        key: 'register-fixture',
        kind: 'register',
        date: '2026-09-28',
        action: 'Declared a gift',
        title,
        detail: '',
        url: 'https://example.invalid/register',
      } as never,
    ],
  };
  const profile = profileFor(view.members.data![0]!.person_id, fixtureCatalogs);
  jest.mocked(catalogs.profileFor).mockResolvedValue(profile as never);
  // Default text size: at accessibility sizes the title runs in full.
  const dimensions = jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width: 951, height: 669, scale: 3, fontScale: 1 });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <YourMPCard
        seat={seat}
        directory={directory}
        stateSeatIds={[]}
        attempt={0}
        onRetry={jest.fn()}
      />,
    );
  });
  const node = renderer.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      n.props.testID === 'today-your-mp-latest-0-title',
  )[0];
  expect(node).toBeDefined();
  expect(node!.props.children).toBe(title);
  expect(node!.props.numberOfLines).toBeGreaterThanOrEqual(3);
  await act(async () => renderer.unmount());
  dimensions.mockRestore();
});

// The real card delegates vote titles to LatestRows. Exercise its mounted
// Text, not just an isolated wordSafe example, on the narrow Duo column.
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
    mockLately = {
      status: 'ready',
      records: [
        {
          key: 'vote-fixture',
          kind: 'vote',
          date: '2026-09-28',
          action: 'Voted for',
          title,
          detail: 'Third reading',
          url: 'https://example.invalid/vote',
        } as never,
      ],
    };
    jest
      .mocked(catalogs.profileFor)
      .mockResolvedValue(
        profileFor(view.members.data![0]!.person_id, fixtureCatalogs) as never,
      );
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        Dimensions.set({
          window: { ...window, width: 402, height: 678, fontScale },
        });
        renderer = TestRenderer.create(
          <YourMPCard
            seat={seat}
            directory={directory}
            stateSeatIds={[]}
            attempt={0}
            onRetry={jest.fn()}
          />,
        );
      });
      const text = () =>
        renderer.root
          .findAllByType(NativeText)
          .find(
            (node) => node.props.testID === 'today-your-mp-latest-0-title',
          )!;
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
