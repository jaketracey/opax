import { act } from 'react';
import { Text as NativeText, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { Heading, InfoButton, SourceLine } from '../src/design/primitives';
import BillDetail from '../src/features/bills/BillDetail';
import { billRoute } from '../src/navigation/routes';
import { pinned, slugs } from './pinned';

const mockParams: { key: string; section?: string } = {
  key: 'au-federal-r7501',
  section: 'divisions',
};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: { billFor: jest.fn(), roster: jest.fn(), slugs: jest.fn() },
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
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BillDetail />);
  });
  return renderer;
}
test('party division links begin with a native division heading, the bill as a row, and keep the recorded counts and sources', async () => {
  const r = await render();
  const heading = r.root.findAllByType(Heading)[0]!;
  expect(heading.props.level).toBe(1);
  expect(heading.props.children).toBe('Bill divisions');
  expect(r.root.findAll((n) => n.props.testID === 'bill-summary')).toHaveLength(
    0,
  );
  const row = (await fixture.billFor(mockParams.key)).data.divisions.data!
    .rows[0]!;
  expect(
    r.root.find(
      (n) =>
        typeof n.type === 'string' &&
        n.props.testID === 'bill-division-0-outcome',
    ).props.accessibilityLabel,
  ).toContain(`${row.ayes} ayes, ${row.noes} noes`);
  // One source line for the block; its sheet lists every division's count.
  const line = r.root.find(
    (n) => n.type === SourceLine && n.props.testID === 'bill-divisions-source',
  );
  expect(line.props.originals).toContainEqual(
    expect.objectContaining({ label: 'They Vote For You', url: row.url }),
  );
  expect(line.props.licence).toBe('ODbL');
  // No lone ⓘ above the title.
  expect(r.root.findAll((n) => n.type === InfoButton)).toHaveLength(0);
  const link = r.root.find(
    (n) =>
      n.props.testID === 'bill-divisions-details' &&
      typeof n.props.onPress === 'function',
  );
  act(() => link.props.onPress());
  expect(router.push).toHaveBeenCalledWith(billRoute(mockParams.key));
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
  expect(
    r.root.findAll((n) => n.props.testID === 'bill-divisions-details'),
  ).toHaveLength(0);
  act(() => r.unmount());
});
test('focused divisions remain uncapped at AX5', async () => {
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  for (const text of r.root.findAllByType(NativeText)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  act(() => r.unmount());
});
test('the whole bill page at AX5: uncapped text, the stage ruler as a list, actions stacked', async () => {
  delete mockParams.section;
  mockParams.key = 'au-federal-r7534';
  jest
    .mocked(runtime.billFor)
    .mockResolvedValue(await fixture.billFor(mockParams.key));
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 390, height: 844, scale: 3, fontScale: 3.571 });
  const r = await render();
  for (const text of r.root.findAllByType(NativeText)) {
    expect(text.props.numberOfLines).toBeUndefined();
    expect(text.props.maxFontSizeMultiplier).toBe(0);
  }
  // The ruler's marks read as one element, whichever way it is drawn.
  const ruler = r.root.find(
    (n) => typeof n.type === 'string' && n.props.testID === 'bill-dates-ruler',
  );
  expect(ruler.props.accessibilityLabel).toBe(
    'Introduced, 17 August 2026; Senate, 19 August 2026; Royal assent, 26 August 2026',
  );
  // One primary action; Ask about this lives under ⋯.
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'bill-read-text',
    ),
  ).toHaveLength(1);
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'bill-ask',
    ),
  ).toHaveLength(0);
  expect(
    r.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'bill-more',
    ),
  ).toHaveLength(1);
  act(() => r.unmount());
  mockParams.key = 'au-federal-r7501';
});
