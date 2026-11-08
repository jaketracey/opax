import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { Heading, InfoButton, SourceLine } from '../src/design/primitives';
import BillDetail from '../src/features/bills/BillDetail';
import { pinned, slugs } from './pinned';

const mockParams: { key: string; section?: string } = {
  key: 'au-federal-r7501',
  section: 'divisions',
};
jest.mock('expo-router', () => ({
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
  // No lone ⓘ above the title.
  expect(r.root.findAll((n) => n.type === InfoButton)).toHaveLength(0);
  act(() => r.unmount());
});
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
