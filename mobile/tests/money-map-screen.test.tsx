import { withNavigationOptions } from './navigation-options';
import { act } from 'react';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { apiClient } from '../src/api/runtime';
import MoneyScreen, { moneyMapLabel } from '../src/features/money/MoneyScreen';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { MoneyMapPanel } from '../src/features/money/map/MoneyMapPanel';
import { MoneyMapSearch } from '../src/features/money/map/MoneyMapSearch';
import { decodeMoneyGraph } from '../src/features/money/data';
import { buildModel } from '../src/features/money/map/model';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { IconButton, SegmentedPicker } from '../src/design/primitives';
import { pinned } from './pinned';

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/map/MoneyMap', () => ({
  MoneyMap: jest.fn(() => null),
}));
let mockReader: boolean | null = false;
jest.mock('../src/features/money/hooks', () => ({
  ...jest.requireActual('../src/features/money/hooks'),
  useFirstScreenReader: () => mockReader,
}));
jest.mock('react-native-gesture-handler', () => require('./gesture-mock'));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  SafeAreaInsetsContext: jest
    .requireActual('react')
    .createContext({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockParams: Record<string, string> = {};
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  setParams: jest.fn(),
};
const mockNavigation = {
  setParams: jest.fn((next: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries(next))
      if (value === undefined) delete mockParams[key];
      else mockParams[key] = value;
  }),
  isFocused: () => true,
  setOptions: jest.fn(),
};
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const Native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const Wrap = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(Native.View, props, children);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    get router() {
      return mockRouter;
    },
    useLocalSearchParams: () => ({ ...mockParams }),
    useRouter: () => mockRouter,
    useNavigation: () => mockNavigation,
    useFocusEffect: () => undefined,
    useSegments: () => [],
    Stack: { Screen: () => null },
  };
});

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
async function render() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      withNavigationOptions(<MoneyScreen />, () => undefined),
    );
  });
  return renderer;
}
const byTestID = (root: ReactTestInstance, id: string) =>
  root.findAll((n) => n.props.testID === id)[0];
const stage = () => jest.mocked(MoneyMap).mock.calls.at(-1)![0];

beforeEach(() => {
  jest.clearAllMocks();
  mockReader = false;
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});

test('the Map view: the stage, the floating card with the picker, the controls and the panel', async () => {
  const r = await render();
  expect(r.root.findByType(SegmentedPicker).props.value).toBe('map');
  expect(byTestID(r.root, 'money-map-card')).toBeDefined();
  expect(byTestID(r.root, 'money-view-summary')).toBeDefined();
  expect(byTestID(r.root, 'money-map-controls')).toBeDefined();
  expect(r.root.findAllByType(MoneyMapPanel)).toHaveLength(1);
  const props = stage();
  expect(props.graph).toBe(props.model === undefined ? null : props.graph);
  expect(props.model.nodes.length).toBe(
    buildModel(moneyView(graph, defaultMoneyFilters(graph))).nodes.length,
  );
  expect(props.focus).toBeNull();
  expect(props.accessibilityLabel).toBe(moneyMapLabel(props.model, null));
  expect(props.accessibilityLabel).toMatch(/^Money map: [\d,]+ discs and/);
  act(() => r.unmount());
});

test('the control stack drives the stage through commands, each with a new seq', async () => {
  const r = await render();
  const press = (id: string) =>
    act(() =>
      r.root
        .findAllByType(IconButton)
        .find((b) => b.props.testID === id)!
        .props.onPress(),
    );
  press('money-map-zoom-in');
  expect(stage().command).toMatchObject({ type: 'zoom', direction: 1, seq: 1 });
  press('money-map-zoom-out');
  expect(stage().command).toMatchObject({
    type: 'zoom',
    direction: -1,
    seq: 2,
  });
  press('money-fit');
  expect(stage().command).toMatchObject({ type: 'fit', seq: 3 });
  act(() => r.unmount());
});

test('a tap on a disc writes the focus to the route and the panel shows its record', async () => {
  const r = await render();
  await act(async () => stage().onFocus('party:Labor'));
  expect(mockNavigation.setParams).toHaveBeenCalledWith({
    select: 'party:Labor',
  });
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(stage().focus).toBe('party:Labor');
  const panel = r.root.findByType(MoneyMapPanel).props;
  expect(panel.focus.node.id).toBe('party:Labor');
  expect(panel.focus.record).toMatchObject({
    pathname: '/money-record',
    params: { node: 'party:Labor', via: 'map' },
  });
  expect(panel.focus.flows.length).toBeGreaterThan(0);
  // Next walks the strongest flow; Previous is then the party.
  expect(panel.focus.next).not.toBeNull();
  expect(panel.focus.previous).toBeNull();
  await act(async () => panel.focus.next.onPress());
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(stage().command).toMatchObject({ type: 'flyTo' });
  const walked = r.root.findByType(MoneyMapPanel).props.focus;
  expect(walked.node.id).toBe(stage().command.id);
  expect(walked.previous.label).toBe('Labor');
  // The stage's actions follow the focus.
  const names = stage().actions.map((a: { name: string }) => a.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'nextFlow',
      'previousFlow',
      'openRecord',
      'clearFocus',
    ]),
  );
  act(() => r.unmount());
});

test('search to fly: the field replaces the card, a result flies and focuses', async () => {
  const r = await render();
  act(() =>
    r.root
      .findAllByType(IconButton)
      .find((b) => b.props.testID === 'money-map-search')!
      .props.onPress(),
  );
  expect(byTestID(r.root, 'money-map-card')).toBeUndefined();
  const search = r.root.findByType(MoneyMapSearch).props;
  await act(async () => search.onChoose('donor:mineralogy'));
  expect(stage().command).toMatchObject({
    type: 'flyTo',
    id: 'donor:mineralogy',
  });
  expect(mockNavigation.setParams).toHaveBeenCalledWith({
    select: 'donor:mineralogy',
  });
  await act(async () =>
    r.update(withNavigationOptions(<MoneyScreen />, () => undefined)),
  );
  expect(r.root.findAllByType(MoneyMapSearch)).toHaveLength(0);
  act(() => r.unmount());
});

test('the List view keeps the same data and the picker switches both ways', async () => {
  const r = await render();
  await act(async () =>
    r.root.findByType(SegmentedPicker).props.onChange('list'),
  );
  expect(byTestID(r.root, 'money-donors')).toBeDefined();
  expect(byTestID(r.root, 'money-title')).toBeDefined();
  expect(r.root.findAllByType(MoneyMapPanel)).toHaveLength(0);
  await act(async () =>
    r.root.findByType(SegmentedPicker).props.onChange('map'),
  );
  expect(byTestID(r.root, 'money-map-card')).toBeDefined();
  act(() => r.unmount());
});

test('a linked view and focus open the map on that disc', async () => {
  mockParams.view = 'map';
  mockParams.select = 'donor:mineralogy';
  const r = await render();
  expect(stage().focus).toBe('donor:mineralogy');
  expect(r.root.findByType(MoneyMapPanel).props.focus.node.label).toBe(
    'Mineralogy Pty Ltd',
  );
  act(() => r.unmount());
});
