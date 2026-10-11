// Build 33 release QA: on a profile at AX5 the figure strip drew "2,929
// divisions" and the pay figure blank (both in the accessibility tree, with
// bounds) and clipped "declared interests" to "declared interest", with tall
// gaps around them. The stacked strip kept the row's flexWrap, and Yoga lays
// the stretched children of a wrapping column out at max-content width.
import { act } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import Person from '../src/features/Person';
import { StatRow, Text } from '../src/design/primitives';
import { catalogs, manifest, people, pinned, roster, slugs } from './pinned';
import { describeWrappingColumns } from './wrapping-columns';

jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    person: jest.fn(),
    profileFor: jest.fn(),
    rosterProfileFor: jest.fn(),
    directory: jest.fn(),
  },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
const mockParams: { slug?: string } = {};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const window = (fontScale: number) => ({
  width: 402,
  height: 874,
  scale: 3,
  fontScale,
});
const sizes = { standard: 1, AX1: 1.786, AX5: 3.571 };
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const mock = runtime as jest.Mocked<typeof runtime>;

async function renderProfile(fontScale: number) {
  jest.mocked(useWindowDimensions).mockReturnValue(window(fontScale));
  // A sitting senator with all three figures: divisions, interests and pay.
  mockParams.slug = 'penny-wong';
  const person = c.joinPerson('penny-wong', slugs, roster, people, manifest);
  mock.person.mockResolvedValue(result(person));
  mock.profileFor.mockResolvedValue(
    c.profileFor(person.canonicalPersonId!, {
      ...catalogs,
      interest: c.decodeInterest(pinned('/interests/10678.json')),
    }),
  );
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<Person />);
  });
  return r;
}
const host = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.find((n) => typeof n.type === 'string' && n.props.testID === testID);
const style = (n: { props: { style?: unknown } }) =>
  StyleSheet.flatten(n.props.style as never) ?? {};
const figureIds = [
  'person-figure-votes',
  'person-figure-interests',
  'person-figure-pay',
];

for (const [size, fontScale] of [
  ['AX1', sizes.AX1],
  ['AX5', sizes.AX5],
] as const) {
  test(`at ${size} the profile strip stacks one full-width figure per row`, async () => {
    const r = await renderProfile(fontScale);
    const strip = style(host(r, 'person-figures'));
    expect(strip.flexDirection).toBe('column');
    expect(strip.flexWrap).not.toBe('wrap');
    for (const id of figureIds) {
      const figure = style(host(r, id));
      // Stretched to the column: no tile basis, minimum or growth.
      expect(figure.flexBasis).toBeUndefined();
      expect(figure.minWidth).toBeUndefined();
      expect(figure.flexGrow).toBeUndefined();
      expect(figure.alignSelf).toBeUndefined();
      // Number and label drawn in full, wrapping only between words.
      const texts = r.root
        .find((n) => n.props.testID === id && typeof n.type !== 'string')
        .findAllByType(Text);
      expect(texts).toHaveLength(2);
      for (const text of texts) {
        expect(text.props.wordSafe).toBe(true);
        expect(text.props.numberOfLines).toBeUndefined();
        expect(text.props.style).toBeUndefined();
      }
    }
    expect(describeWrappingColumns(r)).toEqual([]);
    await act(async () => r.unmount());
  });
}

test('at the standard size the strip stays a wrapping row of tiles', async () => {
  const r = await renderProfile(sizes.standard);
  const strip = style(host(r, 'person-figures'));
  expect(strip.flexDirection).toBe('row');
  expect(strip.flexWrap).toBe('wrap');
  for (const id of figureIds)
    expect(style(host(r, id))).toMatchObject({
      minWidth: 88,
      flexGrow: 1,
      flexBasis: 88,
    });
  await act(async () => r.unmount());
});

test('no view on a profile is a wrapping column, at any size', async () => {
  for (const fontScale of Object.values(sizes)) {
    const r = await renderProfile(fontScale);
    expect(describeWrappingColumns(r)).toEqual([]);
    await act(async () => r.unmount());
  }
});

test('StatRow stacks without wrapping at accessibility sizes', () => {
  const stats = [
    { value: '1,234', label: 'speeches', testID: 'stat-a' },
    { value: '56', label: 'declared interests', testID: 'stat-b' },
  ];
  for (const fontScale of Object.values(sizes)) {
    jest.mocked(useWindowDimensions).mockReturnValue(window(fontScale));
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<StatRow stats={stats} />);
    });
    expect(describeWrappingColumns(r)).toEqual([]);
    const row = StyleSheet.flatten(
      (r.toJSON() as TestRenderer.ReactTestRendererJSON).props.style,
    );
    if (fontScale >= sizes.AX1) {
      expect(row.flexDirection).toBe('column');
      expect(style(host(r, 'stat-a')).flexBasis).toBeUndefined();
    } else {
      expect(row).toMatchObject({ flexDirection: 'row', flexWrap: 'wrap' });
    }
    act(() => r.unmount());
  }
});
