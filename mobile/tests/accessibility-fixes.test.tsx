import { act, type ReactElement } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { BarSeries } from '../src/design/charts';
import { formatMoneyCompact } from '../src/design/format';
import { Pressable } from '../src/design/pressable';
import { ValueRow } from '../src/design/rows';
import {
  ContentUnavailable,
  LoadingStatus,
  StatePageProvider,
} from '../src/design/states';
import { Text } from '../src/design/text';
import { accessibilityElements } from './a11y-tree';

const originalOS = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockResolvedValue(false);
});
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});
async function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

test('compact money is spoken without changing drawn text or caller descriptions', async () => {
  const tree = await render(
    <>
      <Text testID="compact">$2.4m</Text>
      <Text accessibilityLabel="Disclosed amount, $2.4m">$2.4m</Text>
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Open $2.4m record"
      />
      <ValueRow label="Receipts" value="$2.4m" />
    </>,
  );
  const labels = accessibilityElements(tree.root).map(
    (element) => element.label,
  );
  expect(labels).toEqual(
    expect.arrayContaining([
      '2.4 million dollars',
      'Disclosed amount, 2.4 million dollars',
      'Open 2.4 million dollars record',
      'Receipts, 2.4 million dollars',
    ]),
  );
  expect(
    tree.root
      .findAllByType(Text)
      .find((node) => node.props.testID === 'compact')!.props.children,
  ).toBe('$2.4m');
});

test('chart bars and captions use the same spoken money as text', async () => {
  const tree = await render(
    <BarSeries
      ink="money"
      data={[{ label: '2025', value: 2_400_000 }]}
      format={formatMoneyCompact}
      dateRange={{ start: '2025', end: '2025' }}
      citation="Fixture register"
    />,
  );
  expect(
    accessibilityElements(tree.root).map((element) => element.label),
  ).toContain('2025, 2.4 million dollars');
});

test('heading variants have the header trait and explicit roles remain available', async () => {
  const tree = await render(
    <>
      <Text variant="sectionTitle">Records</Text>
      <Text variant="subsectionTitle">Bills</Text>
      <Text variant="pageTitle" accessibilityRole="text">
        Example override
      </Text>
    </>,
  );
  expect(
    accessibilityElements(tree.root).map(({ label, role }) => [label, role]),
  ).toEqual([
    ['Records', 'header'],
    ['Bills', 'header'],
    ['Example override', 'text'],
  ]);
});

test('Android unavailable states have a live region and a heading', async () => {
  Platform.OS = 'android';
  const tree = await render(
    <ContentUnavailable symbol="doc.text" title="No records yet" />,
  );
  expect(
    tree.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLiveRegion === 'polite',
    ),
  ).toHaveLength(1);
  expect(
    accessibilityElements(tree.root).find(
      (element) => element.label === 'No records yet',
    )?.role,
  ).toBe('header');
});

test('iOS loading announces once per page, then announces an unavailable result', async () => {
  Platform.OS = 'ios';
  jest
    .spyOn(AccessibilityInfo, 'isScreenReaderEnabled')
    .mockResolvedValue(true);
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const tree = await render(
    <StatePageProvider>
      <LoadingStatus accessibilityLabel="Loading bills" />
      <LoadingStatus accessibilityLabel="Loading people" />
    </StatePageProvider>,
  );
  expect(announce.mock.calls).toEqual([['Loading bills']]);
  await act(async () => {
    tree.update(
      <StatePageProvider>
        <ContentUnavailable
          symbol="doc.text"
          title="Records could not be loaded"
        />
      </StatePageProvider>,
    );
  });
  expect(announce.mock.calls).toEqual([
    ['Loading bills'],
    ['Records could not be loaded'],
  ]);
});

test('an unmounted loading target never announces after a delayed screen reader read', async () => {
  let answer!: (enabled: boolean) => void;
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const tree = await render(
    <LoadingStatus accessibilityLabel="Loading records" />,
  );
  await act(async () => {
    tree.unmount();
  });
  await act(async () => {
    answer(true);
  });
  expect(announce).not.toHaveBeenCalled();
});

test('Android loading uses its live region without calling the iOS announcement API', async () => {
  Platform.OS = 'android';
  const announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => {});
  const tree = await render(
    <LoadingStatus accessibilityLabel="Loading records" />,
  );
  expect(
    tree.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        node.props.accessibilityLiveRegion === 'polite',
    ),
  ).toHaveLength(1);
  expect(announce).not.toHaveBeenCalled();
});
