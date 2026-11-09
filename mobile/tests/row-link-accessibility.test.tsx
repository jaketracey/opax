import { act, type ReactElement } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Link, router } from 'expo-router';
import { LinkRow, BillRow } from '../src/design/rows';
import { Tile } from '../src/design/card';
import { RowLink } from '../src/design/row-link';

jest.mock('../src/features/follows/store', () => ({
  useFollows: () => [],
  loadFollows: jest.fn(async () => []),
  follow: jest.fn(),
  unfollow: jest.fn(),
}));

// Keep the installed Link, LinkWithPreview, Link.Trigger and Radix Slot. Only
// navigation and native views are stand-ins: the old row-hosting mock skipped
// NativeLinkPreview altogether, so it could not catch the missing subtree.
jest.mock('expo-router', () => {
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});
jest.mock('expo-router/build/hooks', () => ({
  useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock('expo-router/build/link/preview/useNextScreenId', () => ({
  useNextScreenId: () => [{ nextScreenId: undefined, tabPath: [] }, jest.fn()],
}));
jest.mock('expo-router/build/link/preview/LinkPreviewContext', () => ({
  useLinkPreviewContext: () => ({ setOpenPreviewKey: jest.fn() }),
}));
jest.mock('expo-router/build/link/BaseExpoRouterLink', () => ({
  BaseExpoRouterLink: ({
    href,
    onPress,
    children,
  }: Record<string, unknown>) => {
    const { Slot } = jest.requireActual('expo-router/build/ui/Slot');
    return (
      <Slot
        role="link"
        onPress={() => {
          let prevented = false;
          (onPress as ((mockEvent: unknown) => void) | undefined)?.({
            preventDefault: () => (prevented = true),
          });
          if (!prevented) {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require('expo-router').router.push(href);
          }
        }}
      >
        {children as ReactElement}
      </Slot>
    );
  },
}));
jest.mock('expo-router/build/link/preview/native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    NativeLinkPreview: (props: Record<string, unknown>) => (
      <View {...props} nativeID="preview-boundary" />
    ),
    NativeLinkPreviewContent: () => null,
    NativeLinkPreviewAction: () => null,
    LinkZoomTransitionEnabler: () => null,
    LinkZoomTransitionSource: (props: Record<string, unknown>) => (
      <View {...props} style={{ display: 'contents' }} />
    ),
    LinkZoomTransitionAlignmentRectDetector: (
      props: Record<string, unknown>,
    ) => <View {...props} style={{ display: 'contents' }} />,
  };
});

const mounted: TestRenderer.ReactTestRenderer[] = [];
const originalOS = Platform.OS;
const originalExpoOS = process.env.EXPO_OS;
beforeAll(() => {
  process.env.EXPO_OS = 'ios';
});
afterAll(() => {
  if (originalExpoOS === undefined) delete process.env.EXPO_OS;
  else process.env.EXPO_OS = originalExpoOS;
});
function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree.root;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  Platform.OS = originalOS;
  jest.clearAllMocks();
});

const hosts = (root: ReactTestInstance) =>
  root.findAll((node) => typeof node.type === 'string');
const pressable = (root: ReactTestInstance) =>
  root.find(
    (node) =>
      typeof node.type !== 'string' && typeof node.props.style === 'function',
  );
function expectAccessibleLink(
  root: ReactTestInstance,
  testID: string,
  label: string,
) {
  // Grouped children (such as a bill's status) are read through the row.
  // UIKit still needs device verification; this checks the host boundary.
  const targets = hosts(root).filter((node) => {
    if (!node.props.accessible) return false;
    let parent = node.parent;
    while (parent) {
      if (typeof parent.type === 'string' && parent.props.accessible)
        return false;
      parent = parent.parent;
    }
    return true;
  });
  expect(targets).toHaveLength(1);
  const target = targets[0]!;
  let parent = target.parent;
  while (parent) {
    expect(parent.props.nativeID).not.toBe('preview-boundary');
    parent = parent.parent;
  }
  expect(target.props).toMatchObject({
    accessibilityRole: 'link',
    accessibilityLabel: label,
    testID,
    accessibilityElementsHidden: false,
    importantForAccessibility: 'yes',
  });
  expect(hosts(root).filter((node) => node.props.testID === testID)).toEqual([
    target,
  ]);
  return target;
}

describe.each(['ios', 'android'] as const)('%s linking rows', (platform) => {
  beforeEach(() => {
    Platform.OS = platform;
  });
  test('a bill is one accessible link with its label and ID', () => {
    const root = render(
      <BillRow
        billKey="r7529"
        title="Interactive Gambling Amendment Bill 2026"
        accessibilityLabel="Interactive Gambling Amendment Bill 2026, Introduced"
        href="/bill/r7529"
        testID="today-bill-0"
      />,
    );
    const target = expectAccessibleLink(
      root,
      'today-bill-0',
      'Interactive Gambling Amendment Bill 2026, Introduced',
    );
    if (platform === 'ios') {
      const preview = hosts(root).find(
        (node) => node.props.nativeID === 'preview-boundary',
      );
      expect(preview).toBeDefined();
      expect(StyleSheet.flatten(preview!.props.style)).toEqual({
        display: 'contents',
      });
      expect(
        target.findAllByProps({ nativeID: 'preview-boundary' }).length,
      ).toBeGreaterThan(0);
      act(() => target.props.onAccessibilityTap());
    } else {
      act(() => pressable(root).props.onPress());
    }
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/bill/r7529');
  });

  test('a Tile is one accessible link with its title and line', () => {
    const root = render(
      <Tile
        title="Public money"
        line="Grants and contracts by program and place"
        symbol="building.columns"
        ink="money"
        href="/money"
        testID="today-explore-money"
      />,
    );
    const target = expectAccessibleLink(
      root,
      'today-explore-money',
      'Public money, Grants and contracts by program and place',
    );
    expect(StyleSheet.flatten(target.props.style).flexGrow).toBe(1);
  });
});

test('preview slots keep the Pressable style function in both pressed states', () => {
  const style = ({ pressed }: { pressed: boolean }) => [
    { flexDirection: 'row' as const, minHeight: 44 },
    pressed ? { opacity: 0.5 } : null,
  ];
  const root = render(
    <RowLink href="/money">
      <Pressable accessibilityLabel="Public money" testID="money" style={style}>
        <Text>Public money</Text>
      </Pressable>
    </RowLink>,
  );
  const trigger = pressable(root);
  expect(trigger.props.style).toBe(style);
  for (const pressed of [false, true]) {
    expect(StyleSheet.flatten(trigger.props.style({ pressed }))).toEqual({
      flexDirection: 'row',
      minHeight: 44,
      ...(pressed ? { opacity: 0.5 } : {}),
    });
  }
});

test.each([
  {
    name: 'flex and alignment',
    childStyle: { flex: 1, alignSelf: 'flex-start' as const },
    hostStyle: { flex: 1, alignSelf: 'flex-start' },
  },
  {
    name: 'growth, shrink and basis without visual properties',
    childStyle: {
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: '50%' as const,
      margin: 4,
      padding: 8,
      width: 120,
      backgroundColor: 'white',
    },
    hostStyle: { flexGrow: 0, flexShrink: 1, flexBasis: '50%' },
  },
])(
  'the host carries $name and keeps the Pressable style function',
  ({ childStyle, hostStyle }) => {
    const style = () => childStyle;
    const root = render(
      <RowLink href="/money">
        <Pressable
          accessibilityLabel="Public money"
          testID="money"
          style={style}
        >
          <Text>Public money</Text>
        </Pressable>
      </RowLink>,
    );
    const target = expectAccessibleLink(root, 'money', 'Public money');
    expect(StyleSheet.flatten(target.props.style)).toEqual(hostStyle);
    expect(pressable(root).props.style).toBe(style);
    expect(pressable(root).props.style({ pressed: false })).toEqual(childStyle);
  },
);

test('selection and custom menu actions work on the accessible host', () => {
  const select = jest.fn(),
    follow = jest.fn(),
    custom = jest.fn();
  const root = render(
    <RowLink
      href="/money"
      select={select}
      menu={[{ title: 'Follow', onPress: follow }]}
    >
      <Pressable
        testID="money"
        accessibilityLabel="Public money"
        accessibilityState={{ selected: true }}
        accessibilityHint="Opens in the detail pane"
        accessibilityActions={[{ name: 'custom', label: 'Custom action' }]}
        onAccessibilityAction={custom}
      />
    </RowLink>,
  );
  const target = expectAccessibleLink(root, 'money', 'Public money');
  expect(target.props.accessibilityState).toEqual({ selected: true });
  expect(target.props.accessibilityHint).toBe('Opens in the detail pane');
  expect(target.props.accessibilityActions).toEqual([
    { name: 'custom', label: 'Custom action' },
    { name: 'Follow', label: 'Follow' },
  ]);
  act(() => target.props.onAccessibilityTap());
  act(() =>
    target.props.onAccessibilityAction({
      nativeEvent: { actionName: 'Follow' },
    }),
  );
  const event = { nativeEvent: { actionName: 'custom' } };
  act(() => target.props.onAccessibilityAction(event));
  expect(select).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  expect(follow).toHaveBeenCalledTimes(1);
  expect(custom).toHaveBeenCalledWith(event);
});

test('a normal row still pushes by touch through the preview trigger', () => {
  const root = render(
    <LinkRow title="Quizzes and tools" href="/explore" testID="tools" />,
  );
  act(() => pressable(root).props.onPress());
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith('/explore');
});

test('a link without a preview or menu exposes its Pressable directly', () => {
  const root = render(
    <RowLink href="/money" preview={false}>
      <Pressable
        accessibilityLabel="Public money"
        testID="money"
        style={{ minHeight: 44 }}
      >
        <Text>Public money</Text>
      </Pressable>
    </RowLink>,
  );
  const target = expectAccessibleLink(root, 'money', 'Public money');
  expect(
    hosts(root).some((node) => node.props.nativeID === 'preview-boundary'),
  ).toBe(false);
  expect(StyleSheet.flatten(target.props.style).minHeight).toBe(44);
});

test('an accessible host keeps the native preview and zoom trigger', () => {
  const root = render(
    <RowLink href="/money" zoom>
      <Pressable accessibilityLabel="Public money" testID="money">
        <Text>Public money</Text>
      </Pressable>
    </RowLink>,
  );
  expectAccessibleLink(root, 'money', 'Public money');
  expect(root.findAllByType(Link.Preview)).toHaveLength(1);
  expect(root.findByType(Link.Trigger).props.withAppleZoom).toBe(true);
});
