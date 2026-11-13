/**
 * Jake's build 61 screenshots from an iPhone Duo (13 Nov): unfolded in
 * landscape (951 by 669 pt, the vertical tab bar on the trailing edge, a
 * region of about 880 pt beside it) and in portrait (669 by 951 pt, the
 * floating tab bar at the bottom). Windows are simulated with window traits
 * and a measured region, never a device name.
 */
import { NavigationContext } from 'expo-router/react-navigation';
import { act, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestRenderer } from 'react-test-renderer';
import type { Electorate } from '../src/api/catalogs';
import {
  Grid,
  RegionProvider,
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
  type WindowTraits,
} from '../src/design/adaptive';
import { Screen } from '../src/design/layout';
import { PaneBar, PaneHost } from '../src/design/split';
import { rhythm, rhythmRegular } from '../src/design/tokens';
import { PLACEHOLDER } from '../src/features/bills/BillsList';
import { PaneMenu } from '../src/features/bills/BillDetail';
import { AustraliaDots } from '../src/features/today/AustraliaDots';
import type { TodayOrder, TodaySlot } from '../src/features/today/order';
import { SurfaceGrid } from '../src/features/today/SurfaceGrid';
import { TodayBody } from '../src/features/today/TodayBody';
import { stateSeatFor } from '../src/features/today/YourMPCard';
import {
  LatestRow,
  REGISTER_TITLE_LINES,
  type LatestRecord,
} from '../src/features/your-mp/LatestRows';
import { textWidth } from './row-layout';

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
jest.mock('@expo/ui/swift-ui', () => {
  const React = jest.requireActual('react');
  const part = (name: string) =>
    function MockPart({ children, ...props }: Record<string, unknown>) {
      return React.createElement(name, props, children);
    };
  return {
    Host: part('Host'),
    Button: part('MenuButton'),
    Menu: part('Menu'),
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { Pressable } = jest.requireActual('react-native');
  const Link = ({ children, ...props }: { children: unknown }) =>
    React.createElement(Pressable, props, children);
  Link.Trigger = function Trigger({ children }: { children: unknown }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    Link,
    router: { push: jest.fn() },
    useIsPreview: () => false,
    useSegments: () => [],
    useLocalSearchParams: () => ({}),
    Stack: { Screen: () => null },
  };
});
jest.mock('../src/api/runtime', () => ({ catalogs: {} }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const duo: WindowTraits = {
  horizontal: 'regular',
  vertical: 'regular',
  foldable: true,
};
const trees: ReactTestRenderer[] = [];
function render(node: ReactNode) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(node);
  });
  trees.push(tree);
  return tree;
}
const hosts = (tree: ReactTestRenderer, id: string) =>
  tree.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === id,
  );
function windowOf(width: number, height: number, fontScale = 1) {
  jest
    .spyOn(jest.requireActual('react-native'), 'useWindowDimensions')
    .mockReturnValue({ width, height, scale: 3, fontScale });
}
beforeEach(() => {
  windowOf(951, 669);
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
    setWindowTraitsOverride(duo);
  });
});
afterEach(() => {
  act(() => trees.splice(0).forEach((tree) => tree.unmount()));
  jest.mocked(useWindowDimensions).mockRestore();
  act(() => {
    setWindowTraitsOverride(null);
    resetAdaptiveDeviceForTests();
  });
});

describe('Today on an unfolded Duo', () => {
  const order = {
    launchCase: 'A',
    pairInMore: false,
    slots: [
      'your-mp',
      'edition',
      'following',
      'bills',
      'votes',
      'declarations',
      'more',
      'ask',
      'foot',
    ],
  } as unknown as TodayOrder;
  const slot = (name: TodaySlot) => <View key={name} testID={`slot-${name}`} />;
  const body = (width: number) => (
    <RegionProvider value={{ width, height: 669 }}>
      <TodayBody order={order} slot={slot} />
    </RegionProvider>
  );
  test('landscape fills the second pane: two even columns, the reader’s own on the right', () => {
    const tree = render(body(880));
    expect(hosts(tree, 'today-spread')).toHaveLength(1);
    const [leading] = hosts(tree, 'today-spread-leading');
    const [trailing] = hosts(tree, 'today-spread-trailing');
    expect(StyleSheet.flatten(leading!.props.style).flex).toBe(1);
    expect(StyleSheet.flatten(trailing!.props.style).flex).toBe(1);
    const inside = (column: typeof leading) =>
      column!
        .findAll(
          (n) => typeof n.type === 'string' && /^slot-/.test(n.props.testID),
        )
        .map((n) => n.props.testID);
    expect(inside(leading)).toEqual([
      'slot-edition',
      'slot-bills',
      'slot-votes',
      'slot-declarations',
    ]);
    expect(inside(trailing)).toEqual(
      expect.arrayContaining(['slot-your-mp', 'slot-following', 'slot-ask']),
    );
  });
  test.each([669, 560])('%ipt (portrait) stays one column', (width) => {
    windowOf(669, 951);
    const tree = render(body(width));
    expect(hosts(tree, 'today-spread')).toHaveLength(0);
  });
  test('one card in a seat grid takes the whole width, never half of it', () => {
    const one = render(
      <RegionProvider value={{ width: 640, height: 669 }}>
        <SurfaceGrid testID="today-seat-grid">
          <View testID="federal" />
          {null}
        </SurfaceGrid>
      </RegionProvider>,
    );
    expect(one.root.findAllByType(Grid)).toHaveLength(0);
    const two = render(
      <RegionProvider value={{ width: 640, height: 669 }}>
        <SurfaceGrid testID="today-seat-grid">
          <View testID="federal" />
          <View testID="state" />
        </SurfaceGrid>
      </RegionProvider>,
    );
    expect(two.root.findAllByType(Grid)).toHaveLength(1);
  });
  test('a Victorian state seat draws no card (and so holds no cell) from 3 Nov 2026', () => {
    const seat = {
      electorate_id: 'vic-district-fixture',
      name: 'Fixture District',
      jurisdiction: 'vic',
      state_code: 'VIC',
      chamber: 'assembly',
      representatives: [],
    } as unknown as Electorate;
    const directory = {
      electorates: { data: { electorates: [seat] } },
    } as unknown as Parameters<typeof stateSeatFor>[0];
    expect(stateSeatFor(directory, [seat.electorate_id], '2026-11-02')).toBe(
      seat,
    );
    expect(
      stateSeatFor(directory, [seat.electorate_id], '2026-11-13'),
    ).toBeNull();
  });
  test('the dot map is not drawn under the title and date on a regular phone', () => {
    const shared = { value: 0 } as never;
    const tree = render(
      <AustraliaDots state={null} scroll={shared} expandedHeader={shared} />,
    );
    expect(hosts(tree, 'today-australia-dots')).toHaveLength(0);
  });
});

describe('a register entry’s words', () => {
  const record = {
    key: 'register-fixture',
    kind: 'register',
    date: '2026-09-28',
    action: 'Declared a gift',
    // Over 80 characters: build 61 cut it at 79 ("…provided by Endeavou…").
    title:
      'Fixture Cup Final: hospitality and a ticket to the match on 26/09/26 provided by Fixture Hospitality Group',
    detail: '',
    holderLine: 'Declared by the member and their spouse or partner',
    url: 'https://example.invalid/register',
  } as LatestRecord;
  const title = (tree: ReactTestRenderer) =>
    tree.root.findAll(
      (n) => typeof n.type === 'string' && n.props.testID === 'latest-0-title',
    )[0]!;
  test('run to four lines in full words, never cut by characters', () => {
    const tree = render(<LatestRow record={record} testID="latest-0" />);
    const node = title(tree);
    expect(REGISTER_TITLE_LINES).toBeGreaterThanOrEqual(3);
    expect(node.props.numberOfLines).toBe(REGISTER_TITLE_LINES);
    expect(node.props.ellipsizeMode).toBe('tail');
    expect(
      tree.root.findAll(
        (n) => typeof n.type === 'string' && n.props.children === record.title,
      ),
    ).not.toHaveLength(0);
  });
  test('run in full at accessibility sizes', () => {
    windowOf(951, 669, 3.1);
    const tree = render(<LatestRow record={record} testID="latest-0" />);
    expect(title(tree).props.numberOfLines).toBeUndefined();
  });
});

describe('Bills beside a Duo split', () => {
  test('the search placeholder fits the bar’s field (about 190 pt of text)', () => {
    // 240 pt field on the unfolded Duo, less the magnifier and padding.
    expect(textWidth(PLACEHOLDER, 17)).toBeLessThanOrEqual(190);
    expect(PLACEHOLDER).not.toMatch(/—/);
  });
  test('the record starts 8 pt under its pane actions, not a section gap below', () => {
    const pane = {
      entries: [],
      depth: 1,
      push: jest.fn(),
      select: jest.fn(),
      back: () => false,
    };
    const navigation = {
      setOptions: jest.fn(),
      isFocused: () => true,
      addListener: () => () => undefined,
    } as never;
    const tree = render(
      <NavigationContext.Provider value={navigation}>
        <PaneHost
          pane={pane}
          bar={
            <PaneBar back={null} onBack={jest.fn()} actions={<Pressable />} />
          }
        >
          <Screen>
            <View testID="record-badge" />
          </Screen>
        </PaneHost>
      </NavigationContext.Provider>,
    );
    const [wrap] = hosts(tree, 'screen-pane-bar');
    const [bar] = hosts(tree, 'split-pane-bar');
    let content = wrap!.parent!;
    while (
      typeof content.type !== 'string' ||
      StyleSheet.flatten(content.props.style)?.gap === undefined
    )
      content = content.parent!;
    const gap = Number(StyleSheet.flatten(content.props.style).gap);
    expect([rhythm.section, rhythmRegular.section]).toContain(gap);
    const barBottom = Number(StyleSheet.flatten(bar!.props.style).marginBottom);
    const wrapBottom = Number(
      StyleSheet.flatten(wrap!.props.style).marginBottom,
    );
    // Bar band, its own -8, the wrapper's margin, then the column gap.
    expect(barBottom + wrapBottom + gap).toBe(rhythm.tight);
  });
  test('⋯ draws in a fixed 44 pt frame, so it stays on the actions’ line', () => {
    const tree = render(
      <PaneMenu billKey="fixture-bill" title="A fixture bill" testID="more" />,
    );
    const host = tree.root.find((n) => n.type === ('Host' as never));
    expect(host.props.matchContents).toBeUndefined();
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({
      width: 44,
      height: 44,
    });
  });
});
