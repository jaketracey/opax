import { act } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { router } from 'expo-router';
import { Catalogs } from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { BillRow } from '../src/design/primitives';
import BillsList from '../src/features/bills/BillsList';
import { pinned, slugs } from './pinned';

// Design pass 5, lane C, P2-21 (bills half): in landscape on regular width
// the Bills split opens its first bill rather than an empty pane. The
// selection goes through the route, as a tap's does; portrait keeps the
// quiet empty pane, and the iPhone is untouched (design-p5-C-bills.test).
const mockLayout = { regular: true, landscape: true };
jest.mock('../src/design/adaptive', () => {
  const actual = jest.requireActual('../src/design/adaptive');
  return {
    ...actual,
    isPad: true,
    useLayout: () => {
      const width = mockLayout.landscape ? 1366 : 1024;
      const height = mockLayout.landscape ? 1024 : 1366;
      return {
        size: mockLayout.regular ? 'regular' : 'compact',
        regular: mockLayout.regular,
        wide: mockLayout.regular && width >= 1100,
        width,
        height,
        window: { width, height },
        landscape: mockLayout.landscape,
      };
    },
  };
});
const mockParams: { bill?: string } = {};
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, []);
  },
  router: { push: jest.fn(), setParams: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    bills: jest.fn(),
    billFor: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
    directory: jest.fn(),
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
const mock = jest.mocked(runtime);
beforeEach(() => {
  jest.clearAllMocks();
  delete mockParams.bill;
  mockLayout.regular = true;
  mockLayout.landscape = true;
  jest
    .mocked(useWindowDimensions)
    .mockReturnValue({ width: 1366, height: 1024, scale: 2, fontScale: 1 });
  mock.bills.mockImplementation((refresh) => fixture.bills(refresh));
  mock.billFor.mockImplementation((key, refresh) =>
    fixture.billFor(key, refresh),
  );
  mock.roster.mockImplementation(() => fixture.roster());
  mock.slugs.mockImplementation(() => fixture.slugs());
  mock.directory.mockRejectedValue(new Error('not in this test'));
  // A write to the route stands in for expo-router's: the screen re-reads it.
  jest.mocked(router.setParams).mockImplementation((params) => {
    Object.assign(mockParams, params);
  });
});
const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<BillsList />);
  });
  mounted.push(renderer);
  return renderer;
}
const rerender = (renderer: TestRenderer.ReactTestRenderer) =>
  act(async () => renderer.update(<BillsList />));

test('landscape: the first bill opens in the pane, as a selection, once', async () => {
  const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
  const renderer = await render();
  const first = renderer.root.findAllByType(BillRow)[0]!;
  expect(router.setParams).toHaveBeenCalledTimes(1);
  expect(router.setParams).toHaveBeenCalledWith({
    bill: first.props.testID.slice('bill-row-'.length),
  });
  // Never a navigation, and VoiceOver stays where it was.
  expect(router.push).not.toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
  await rerender(renderer);
  const selected = renderer.root
    .findAllByType(BillRow)
    .filter((row) => row.props.selected);
  expect(selected.map((row) => row.props.testID)).toEqual([first.props.testID]);
  expect(
    renderer.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'bills-split-empty',
    ),
  ).toHaveLength(0);
  // Closing the pane (Escape) keeps it closed: no second automatic open.
  act(() => router.setParams({ bill: '' }));
  jest.mocked(router.setParams).mockClear();
  await rerender(renderer);
  expect(router.setParams).not.toHaveBeenCalled();
});

test('a bill already chosen (a deep link, a tap) is left as it is', async () => {
  mockParams.bill = 'au-federal-r6850';
  await render();
  expect(router.setParams).not.toHaveBeenCalled();
});

test('portrait keeps the empty pane until the iPad turns to landscape', async () => {
  mockLayout.landscape = false;
  const renderer = await render();
  expect(router.setParams).not.toHaveBeenCalled();
  expect(
    renderer.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.testID === 'bills-split-empty',
    ),
  ).toHaveLength(1);
  mockLayout.landscape = true;
  await rerender(renderer);
  expect(router.setParams).toHaveBeenCalledTimes(1);
});

test('a compact window in landscape (Slide Over, a narrow split) opens nothing', async () => {
  mockLayout.regular = false;
  await render();
  expect(router.setParams).not.toHaveBeenCalled();
});
