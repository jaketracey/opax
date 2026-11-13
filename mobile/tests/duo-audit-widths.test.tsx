import { act, type ReactNode } from 'react';
import TestRenderer from 'react-test-renderer';
import { Dimensions, StyleSheet, View } from 'react-native';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  splitPaneWidth,
  useLayout,
  type Layout,
  type WindowTraits,
} from '../src/design/adaptive';
import { Screen } from '../src/design/layout';
import Hub from '../src/features/money-public/Hub';

/**
 * iPhone Duo audit (im-duo-audit, 13 Nov): the regions a screen's content
 * gets on each Duo pose, measured through the real `Screen` column, and the
 * screens that lay themselves out from them. The simulator boots folded and
 * cannot unfold, so these renders stand in for the inner display.
 *
 * Poses (points): the outer display folded, 466 by 678, compact, its tab rail
 * vertical on the trailing side; the inner display unfolded in landscape, 951
 * by 669, regular/regular, rail trailing (about 80pt of safe area); in
 * portrait, 669 by 951, regular/regular with a floating bottom bar; and the
 * widths between (700, 800, 900).
 */

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: false } },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');
  const Wrap = (props: object) => React.createElement(NativeView, props);
  return {
    Link: Object.assign(Wrap, {
      Trigger: Wrap,
      Preview: () => null,
      Menu: Wrap,
      MenuAction: Wrap,
    }),
    Redirect: () => null,
    useRouter: () => ({ push: jest.fn() }),
    useNavigation: () => ({ setOptions: jest.fn(), setParams: jest.fn() }),
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
    Stack: { Screen: () => null },
  };
});
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
// The cards' figures are covered by money-public-screens; here only their row.
jest.mock('../src/features/money-public/HubCards', () => {
  const { View: NativeView } = jest.requireActual('react-native');
  return {
    GrantsCard: () => <NativeView testID="hub-card-grants" />,
    ContractsCard: () => <NativeView testID="hub-card-contracts" />,
    PartiesCard: () => <NativeView testID="hub-card-parties" />,
  };
});

const regular: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const compactOuter: WindowTraits = {
  horizontal: 'compact',
  vertical: 'regular',
  foldable: true,
  verticalBars: true,
};

interface Pose {
  name: string;
  window: { width: number; height: number };
  traits: WindowTraits;
  /** The safe-area sides a vertical rail takes from the scroll view. */
  rail: number;
}
const poses: Pose[] = [
  {
    name: 'outer, folded',
    window: { width: 466, height: 678 },
    traits: compactOuter,
    rail: 80,
  },
  {
    name: 'inner, landscape',
    window: { width: 951, height: 669 },
    traits: { ...regular, verticalBars: true },
    rail: 80,
  },
  {
    name: 'inner, portrait',
    window: { width: 669, height: 951 },
    traits: regular,
    rail: 0,
  },
  {
    name: '700pt',
    window: { width: 700, height: 669 },
    traits: regular,
    rail: 0,
  },
  {
    name: '800pt',
    window: { width: 800, height: 669 },
    traits: regular,
    rail: 0,
  },
  {
    name: '900pt',
    window: { width: 900, height: 669 },
    traits: regular,
    rail: 0,
  },
];

const mounted: TestRenderer.ReactTestRenderer[] = [];
function pose(p: Pose, fontScale = 1) {
  act(() => {
    const size = { ...p.window, scale: 3, fontScale };
    Dimensions.set({ window: size, screen: size });
    setWindowTraitsOverride(p.traits);
  });
}
beforeEach(() => {
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

function render(children: ReactNode) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<>{children}</>);
  });
  mounted.push(tree);
  return tree;
}

/** Lays out a Screen's scroll view at the pose's width less its rail. */
function layOut(tree: TestRenderer.ReactTestRenderer, testID: string, p: Pose) {
  const scroll = tree.root.find(
    (node) =>
      typeof node.type !== 'string' &&
      node.props.testID === testID &&
      typeof node.props.onLayout === 'function',
  );
  act(() =>
    scroll.props.onLayout({
      nativeEvent: {
        layout: {
          x: 0,
          y: 0,
          width: p.window.width - p.rail,
          height: p.window.height,
        },
      },
    }),
  );
}

/** Hands the layout it reads to the test through a host prop. */
function Probe() {
  const layout = useLayout();
  return <View testID="probe" {...({ layout } as object)} />;
}
function probeOf(tree: TestRenderer.ReactTestRenderer): Layout {
  return tree.root.find(
    (node) => typeof node.type === 'string' && node.props.testID === 'probe',
  ).props.layout as Layout;
}

describe('the regions a Duo screen gets', () => {
  // Read through the real Screen column: the measured scroll view, less the
  // column's inset. Expected values are the design rule, not a snapshot.
  const expected: Record<
    string,
    { rule: Layout['rule']; regular: boolean; readable: number; wide: number }
  > = {
    'outer, folded': {
      rule: 'phone',
      regular: false,
      // 466 less the 80pt rail is under 414pt: the 16pt phone margin.
      readable: 386 - 32,
      wide: 386 - 32,
    },
    'inner, landscape': {
      rule: 'phone-regular',
      regular: true,
      readable: 871 - 2 * 86,
      wide: 871 - 64,
    },
    'inner, portrait': {
      rule: 'phone-regular',
      regular: true,
      readable: 669 - 64,
      wide: 669 - 64,
    },
    '700pt': { rule: 'phone-regular', regular: true, readable: 636, wide: 636 },
    '800pt': { rule: 'phone-regular', regular: true, readable: 700, wide: 736 },
    '900pt': { rule: 'phone-regular', regular: true, readable: 700, wide: 836 },
  };
  test.each(poses.map((p) => [p.name, p] as const))('%s', (_name, p) => {
    pose(p);
    const column = (kind: 'readable' | 'wide') => {
      const tree = render(
        <Screen testID={`screen-${kind}`} column={kind}>
          <Probe />
        </Screen>,
      );
      layOut(tree, `screen-${kind}`, p);
      return probeOf(tree);
    };
    const readable = column('readable');
    const wide = column('wide');
    const want = expected[p.name]!;
    expect(readable.rule).toBe(want.rule);
    expect(readable.regular).toBe(want.regular);
    expect(Math.round(readable.width)).toBe(want.readable);
    expect(Math.round(wide.width)).toBe(want.wide);
  });

  test('a two-pane split on the inner display leaves a list of at least 260pt', () => {
    // 42% of the shared region, 260pt minimum, never over half.
    expect(splitPaneWidth(871, false, 'phone-regular')).toBe(366);
    expect(splitPaneWidth(669, false, 'phone-regular')).toBe(281);
    expect(splitPaneWidth(700, false, 'phone-regular')).toBe(294);
    expect(splitPaneWidth(871, true, 'phone-regular')).toBe(392);
  });
});

describe('Public money on a Duo', () => {
  function hub(p: Pose, fontScale = 1) {
    pose(p, fontScale);
    const tree = render(<Hub />);
    layOut(tree, 'money-hub', p);
    // The row is the innermost host view holding all three cards (found by
    // structure, so the check holds with or without its testID).
    const holds = (node: TestRenderer.ReactTestInstance, id: string) =>
      node.findAll((child) => child.props.testID === id).length > 0;
    const rows = tree.root.findAll(
      (node) =>
        typeof node.type === 'string' &&
        holds(node, 'hub-card-grants') &&
        holds(node, 'hub-card-parties'),
    );
    const row = rows[rows.length - 1]!;
    return StyleSheet.flatten(row.props.style) ?? {};
  }
  const at = (name: string) => poses.find((p) => p.name === name)!;

  test('the three question cards stack in a 605pt column (unfolded portrait), not three 190pt cards', () => {
    expect(hub(at('inner, portrait')).flexDirection).not.toBe('row');
    expect(hub(at('700pt')).flexDirection).not.toBe('row');
  });

  test('they sit side by side where each keeps 240pt (unfolded landscape, 900pt)', () => {
    expect(hub(at('inner, landscape')).flexDirection).toBe('row');
    expect(hub(at('900pt')).flexDirection).toBe('row');
    // 800pt leaves a 736pt column: three cards would be 234pt each.
    expect(hub(at('800pt')).flexDirection).not.toBe('row');
  });

  test('accessibility text sizes stack them at any Duo width', () => {
    expect(hub(at('inner, landscape'), 2.35).flexDirection).not.toBe('row');
  });

  test('the folded outer display keeps its single column', () => {
    expect(hub(at('outer, folded')).flexDirection).not.toBe('row');
  });
});
