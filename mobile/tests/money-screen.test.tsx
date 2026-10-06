import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo } from 'react-native';
import { apiClient } from '../src/api/runtime';
import MoneyScreen from '../src/features/money/MoneyScreen';
import MoneyNodeScreen from '../src/features/money/MoneyNodeScreen';
import { NativeMoneyMap } from '../src/features/money/NativeMoneyMap';
import {
  Button,
  KeyValueList,
  MoneyFigure,
  SegmentedControl,
  SourceLink,
} from '../src/design/primitives';
import { pinned } from './pinned';
import { RecordRow } from '../src/features/RecordRow';

test('the accessible list opens every party and public-money hub without the canvas', async () => {
  const r = await render(<MoneyScreen />);
  await act(async () =>
    r.root
      .findAllByType(Button)
      .find((x) => x.props.testID === 'money-list-records-toggle')!
      .props.onPress(),
  );
  const raw = pinned('/graph/money.json') as {
    nodes: { id: string; kind: string }[];
  };
  const targets = raw.nodes.filter(
    (n) => n.kind === 'party' || n.kind === 'grantor',
  );
  for (const node of targets) {
    const row = r.root
      .findAllByType(RecordRow)
      .find((x) => x.props.testID === `money-list-record-${node.id}`)!;
    expect(row).toBeDefined();
    await act(async () => row.props.onPress());
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pathname: '/money-node',
        params: expect.objectContaining({ node: node.id }),
      }),
    );
  }
  await act(async () => r.unmount());
});

jest.mock('../src/api/runtime', () => ({ apiClient: { get: jest.fn() } }));
jest.mock('../src/features/money/NativeMoneyMap', () => ({
  NativeMoneyMap: jest.fn(() => null),
}));
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const value: Record<string, unknown> = {};
    for (const name of [
      'runOnJS',
      'activeOffsetX',
      'failOffsetY',
      'onBegin',
      'onUpdate',
      'onEnd',
      'onFinalize',
    ])
      value[name] = () => value;
    return value;
  };
  return {
    GestureHandlerRootView: jest.requireActual('react-native').View,
    GestureDetector: jest.requireActual('react-native').View,
    Gesture: { Pan: chain, Tap: chain, Race: chain },
  };
});
const mockParams: Record<string, string> = {};
const mockRouter = { push: jest.fn(), replace: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
}));
let readerAnswer!: (value: boolean) => void;
let readerChanged: ((value: boolean) => void) | undefined;
const removed = jest.fn();
jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(
  () =>
    new Promise((resolve) => {
      readerAnswer = resolve;
    }),
);
jest
  .spyOn(AccessibilityInfo, 'addEventListener')
  .mockImplementation((event, listener) => {
    if (event === 'screenReaderChanged')
      readerChanged = listener as (value: boolean) => void;
    return { remove: removed };
  });
async function render(element: React.ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}
beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(mockParams).forEach((key) => delete mockParams[key]);
  jest.mocked(apiClient.get).mockImplementation(async (path, decode) => ({
    data: decode(pinned(path)),
    stale: false,
    asOf: '2026-09-21',
    savedAt: 1,
  }));
});
test('VoiceOver defaults to the ranked list, including before its asynchronous setting is known', async () => {
  const r = await render(<MoneyScreen />);
  expect(r.root.findByType(SegmentedControl).props.value).toBe('list');
  expect(NativeMoneyMap).not.toHaveBeenCalled();
  await act(async () => readerAnswer(true));
  expect(r.root.findByType(SegmentedControl).props.value).toBe('list');
  expect(r.root.findAllByType(SourceLink).length).toBeGreaterThan(0);
  await act(async () => r.unmount());
  expect(removed).toHaveBeenCalled();
});
test('a setting change switches to the list and filters preserve the held year totals', async () => {
  const r = await render(<MoneyScreen />);
  await act(async () => readerAnswer(false));
  expect(r.root.findByType(SegmentedControl).props.value).toBe('3d');
  await act(async () => readerChanged?.(true));
  expect(r.root.findByType(SegmentedControl).props.value).toBe('list');
  const button = (id: string) =>
    r.root.findAllByType(Button).find((x) => x.props.testID === id)!;
  await act(async () => button('money-test-year').props.onPress());
  await act(async () => button('money-test-focus').props.onPress());
  expect(mockRouter.push).toHaveBeenLastCalledWith(
    expect.objectContaining({
      pathname: '/money-node',
      params: expect.objectContaining({
        node: 'party:Labor',
        from: '2024',
        to: '2024',
      }),
    }),
  );
  await act(async () => r.unmount());
});
test('the native focus record shows the pinned selected-year figure, years and original source', async () => {
  Object.assign(mockParams, {
    node: 'party:Labor',
    from: '2024',
    to: '2024',
    industry: 'unions',
    layers: 'donations',
  });
  const r = await render(<MoneyNodeScreen />);
  expect(r.root.findAllByType(MoneyFigure)[0]!.props.amount).toBe(69010542);
  const rows = r.root.findByType(KeyValueList).props.items;
  expect(rows).toContainEqual(expect.objectContaining({ value: '2024' }));
  expect(
    r.root
      .findAllByType(SourceLink)
      .some((x) => x.props.url === 'https://transparency.aec.gov.au/'),
  ).toBe(true);
  await act(async () => r.unmount());
});

test('a public-money focus figure states the mapped-donor scope and contract coverage', async () => {
  const raw = pinned('/graph/money.json') as {
    nodes: { id: string; kind: string; flow?: string; count: number }[];
    meta: { contracts_coverage: string };
  };
  const hub = raw.nodes.find(
    (n) => n.kind === 'grantor' && n.flow === 'contracts',
  )!;
  Object.assign(mockParams, { node: hub.id });
  const r = await render(<MoneyNodeScreen />);
  expect(r.root.findAllByType(MoneyFigure)[0]!.props.label).toContain(
    'held by donors on this map across',
  );
  expect(JSON.stringify(r.toJSON())).toContain(raw.meta.contracts_coverage);
  await act(async () => r.unmount());
});
