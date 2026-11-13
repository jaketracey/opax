import { act } from 'react';
import { router } from 'expo-router';
import {
  Text as NativeText,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import {
  Heading,
  Icon,
  SectionHeader,
  SourceLine,
} from '../src/design/primitives';
import { sheetPayload } from '../src/navigation/sheets';
import BillDetail from '../src/features/bills/BillDetail';
import { pinned, slugs } from './pinned';

const mockParams: { key: string; section?: string } = {
  key: 'au-federal-r7501',
  section: 'divisions',
};
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  // The bill page's bottom toolbar, and rows that link through Link.
  Stack: {
    Screen: () => null,
    Toolbar: Object.assign(() => null, {
      Button: () => null,
      Spacer: () => null,
    }),
  },
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    billFor: jest.fn(),
    billIndexRow: () => null,
    roster: jest.fn(),
    slugs: jest.fn(),
  },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const fixture = new Catalogs({
  get: async (path, decode) => ({
    data: decode(path === '/api/person-slugs' ? slugs : pinned(path)),
    stale: false,
    savedAt: 1000,
    asOf: null,
  }),
});
beforeEach(async () => {
  jest.clearAllMocks();
  mockParams.key = 'au-federal-r7501';
  mockParams.section = 'divisions';
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 1 });
  jest
    .mocked(runtime.billFor)
    .mockResolvedValue(await fixture.billFor(mockParams.key));
  jest.mocked(runtime.roster).mockResolvedValue(await fixture.roster());
  jest.mocked(runtime.slugs).mockResolvedValue(await fixture.slugs());
});
/** Text outside the speech rows, whose briefs clamp to three lines (4.2.6). */
const uncappable = (root: ReactTestInstance) =>
  root.findAllByType(NativeText).filter((text) => {
    for (let n: ReactTestInstance | null = text; n; n = n.parent)
      if (/^bill-speech-\d+$/.test(n.props?.testID ?? '')) return false;
    return true;
  });
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BillDetail />);
  });
  return renderer;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const button = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) =>
      node.props.testID === testID && typeof node.props.onPress === 'function',
  );
function hostParent(node: ReactTestInstance) {
  let parent = node.parent;
  while (parent && typeof parent.type !== 'string') parent = parent.parent;
  return parent!;
}
const style = (node: ReactTestInstance) =>
  StyleSheet.flatten(
    typeof node.props.style === 'function'
      ? node.props.style({ pressed: false })
      : node.props.style,
  ) ?? {};

test.each([1, 1.786, 3.571])(
  'the In short pill shares a wrapping, centred heading row at font scale %s',
  async (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale,
    });
    const r = await render();
    const summary = host(r.root, 'bill-summary');
    const header = summary.find(
      (node) => node.type === SectionHeader && node.props.title === 'In short',
    );
    expect(header.props.title).toBe('In short');
    const row = header.findByType(View);
    expect(style(row)).toMatchObject({
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
    });
    expect(
      StyleSheet.flatten(header.findByType(Heading).props.style),
    ).toMatchObject({
      flexGrow: 1,
      flexShrink: 0,
      maxWidth: '100%',
    });
    const pill = host(header, 'bill-summary-label');
    expect(style(hostParent(pill))).toMatchObject({
      marginLeft: 'auto',
      maxWidth: '100%',
    });
    expect(pill.props.accessibilityRole).toBe('button');
    expect(pill.props.accessibilityLabel).toBe('Machine-written');
    expect(pill.props.accessibilityHint).toBe('Opens how this was written');
    expect(
      summary
        .findAllByType(NativeText)
        .every((text) => text.props.numberOfLines === undefined),
    ).toBe(true);
    act(() => button(header, 'bill-summary-label').props.onPress());
    const route = jest.mocked(router.push).mock.calls.at(-1)![0] as {
      params: { key: string };
    };
    expect(sheetPayload(route.params.key, 'machine')?.testID).toBe(
      'bill-summary-label',
    );
    act(() => r.unmount());
  },
);

test.each([1, 3.571])(
  'main and all eight procedural vote rows share the measured list width at font scale %s',
  async (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale,
    });
    const record = await fixture.billFor(mockParams.key);
    const base = record.data.divisions.data!;
    jest.mocked(runtime.billFor).mockResolvedValue({
      ...record,
      data: {
        ...record.data,
        divisions: {
          ...record.data.divisions,
          data: {
            ...base,
            rows: Array.from({ length: 10 }, (_, index) => ({
              ...base.rows[0]!,
              key: `layout-vote-${index}`,
              stage: index < 2 ? 'Third reading' : 'Limitation of debate',
              title:
                index === 2 ? 'Closure' : 'Motion to suspend standing orders',
              // The time-limit motion itself; a passage or amendment taken
              // under the limit would be substantive.
              ...(index < 2
                ? null
                : {
                    question:
                      'The question is that the motion as moved by the minister be agreed to.',
                  }),
            })),
          },
        },
      },
    });
    const r = await render();
    const procedural = host(r.root, 'bill-divisions-procedural');
    expect(procedural.props.accessibilityLabel).toBe('Procedural votes (8)');
    act(() => button(r.root, 'bill-divisions-procedural').props.onPress());
    for (const width of [358, 614]) {
      act(() =>
        host(r.root, 'bill-divisions-layout').props.onLayout({
          nativeEvent: { layout: { x: 0, y: 0, width, height: 900 } },
        }),
      );
      const section = host(r.root, 'bill-divisions');
      const rows = section.findAll(
        (node) =>
          typeof node.type === 'string' &&
          /^bill-division-\d+-more$/.test(node.props.testID ?? ''),
      );
      expect(rows).toHaveLength(10);
      for (const row of rows) {
        expect(style(row)).toMatchObject({
          width,
          flexDirection: 'row',
          alignItems: 'center',
        });
        // The row and every group around it start at the section's leading edge.
        for (
          let parent: ReactTestInstance | null = row;
          parent && parent !== section;
          parent = parent.parent
        ) {
          if (typeof parent.type !== 'string') continue;
          const layout = style(parent);
          for (const prop of [
            'marginLeft',
            'marginHorizontal',
            'paddingLeft',
            'paddingHorizontal',
          ] as const)
            expect(layout[prop] ?? 0).toBe(0);
        }
        const chevron = row.findAllByType(Icon).at(-1)!;
        expect(chevron.props).toMatchObject({
          name: 'chevron.down',
          size: 13,
          maxScale: 1.5,
        });
      }
      expect(style(procedural)).toMatchObject({
        flexDirection: 'row',
        gap: style(rows[0]!).gap,
      });
      expect(procedural.findAllByType(Icon).at(-1)!.props.size).toBe(13);
    }
    act(() => button(r.root, 'bill-division-2-more').props.onPress());
    expect(
      host(r.root, 'bill-division-2-more').props.accessibilityState,
    ).toEqual({ expanded: true });
    expect(
      host(r.root, 'bill-division-2-more').findAllByType(Icon).at(-1)!.props
        .name,
    ).toBe('chevron.up');
    act(() => r.unmount());
  },
);
test('ordinary bill routes retain the title, summary, dates and divisions', async () => {
  delete mockParams.section;
  const r = await render();
  expect(r.root.findAllByType(Heading)[0]!.props.children).not.toBe(
    'Bill divisions',
  );
  for (const id of ['bill-summary', 'bill-key-dates', 'bill-divisions'])
    expect(r.root.findAll((n) => n.props.testID === id).length).toBeGreaterThan(
      0,
    );
  act(() => r.unmount());
});
test('focused divisions remain uncapped at AX5', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  for (const text of uncappable(r.root)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  act(() => r.unmount());
});
test('the whole bill page at AX5: uncapped text, the stage ruler as one element, no ⋯ beside Follow', async () => {
  delete mockParams.section;
  mockParams.key = 'au-federal-r7534';
  jest
    .mocked(runtime.billFor)
    .mockResolvedValue(await fixture.billFor(mockParams.key));
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  for (const text of uncappable(r.root)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  // The ruler's marks read as one element, whichever way it is drawn.
  const ruler = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'bill-dates-ruler',
  );
  expect(ruler.props.accessibilityLabel).toBe(
    'Introduced, 17 August 2026; Senate, 19 August 2026; Royal Assent, 26 August 2026',
  );
  // Bill text is a row; Ask and Share are in the bottom toolbar and the
  // menus in the bar, so the content holds no ⋯ beside Follow.
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'bill-read-text',
    ),
  ).toHaveLength(1);
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'bill-more',
    ),
  ).toHaveLength(0);
  act(() => r.unmount());
  mockParams.key = 'au-federal-r7501';
});

test('?section=divisions opens the whole bill, its votes dated and sourced', async () => {
  const r = await render();
  // No intermediate "Bill divisions" view: the bill itself, scrolled to its votes.
  const heading = r.root.findAllByType(Heading)[0]!;
  expect(heading.props.level).toBe(1);
  expect(heading.props.children).not.toBe('Bill divisions');
  const row = (await fixture.billFor(mockParams.key)).data.divisions.data!
    .rows[0]!;
  const vote = r.root.find(
    (n) =>
      typeof n.type === 'string' &&
      /^bill-division-\d+-more$/.test(n.props.testID ?? '') &&
      n.props.accessibilityLabel.includes(`${row.ayes} ayes, ${row.noes} noes`),
  );
  expect(vote.props.accessibilityState).toEqual({ expanded: false });
  // One source line for the block; its sheet lists every vote's original.
  const line = r.root.find(
    (n) => n.type === SourceLine && n.props.testID === 'bill-divisions-source',
  );
  expect(line.props.originals).toContainEqual(
    expect.objectContaining({ label: 'They Vote For You', url: row.url }),
  );
  expect(line.props.licence).toBe('ODbL');
  act(() => r.unmount());
});
