import { act, cloneElement } from 'react';
import TestRenderer from 'react-test-renderer';
import * as Native from 'react-native';
import {
  Appearance,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { dark, light } from '../src/design/palette';
import { partyDot, partyWash } from '../src/design/party';
import { RecordedParty } from '../src/features/bills/parts';
import { outlineColours } from '../src/features/electorate-map/OutlineMap';
import { ProfileHeader, PartyDot } from '../src/features/people/ProfileHeader';
import { PullRefresh } from '../src/features/people/PullRefresh';

// Dark mode, People and Parliament (19 Nov 2026): the treatments that are
// not the mechanical move to useColors. Each test fails if its behaviour is
// reverted.
jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children: unknown }) => children, {
    Trigger: ({ children }: { children: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
}));

const originalOS = Platform.OS;
function system(os: 'ios' | 'android', scheme: 'light' | 'dark') {
  Platform.OS = os;
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
}
afterEach(() => {
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});
type Flat = Record<string, unknown>;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Flat;
function draw(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}
const grounds = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(View)
    .map((node) => flat(node.props.style).backgroundColor)
    .filter(Boolean);

describe('party dots', () => {
  test('the profile header dot takes the dark set in dark', () => {
    system('ios', 'dark');
    const tree = draw(<PartyDot party="Australian Labor Party" />);
    expect(grounds(tree)).toEqual([partyDot('Australian Labor Party', 'dark')]);
    expect(partyDot('Australian Labor Party', 'dark')).not.toBe(
      partyDot('Australian Labor Party', 'light'),
    );
  });

  test('and the light set in light, as before', () => {
    system('ios', 'light');
    const tree = draw(<PartyDot party="Australian Labor Party" />);
    expect(grounds(tree)).toEqual([
      partyDot('Australian Labor Party', 'light'),
    ]);
  });

  test('a bill page names a party with the dot for the scheme', () => {
    for (const scheme of ['light', 'dark'] as const) {
      system('ios', scheme);
      const tree = draw(<RecordedParty party="Liberal Party of Australia" />);
      expect(grounds(tree)).toContain(
        partyDot('Liberal Party of Australia', scheme),
      );
      act(() => tree.unmount());
      jest.restoreAllMocks();
    }
  });
});

describe('a party page title', () => {
  const header = (
    <ProfileHeader variant="party" name="Australian Greens" testID="party" />
  );

  test('sits on the party’s dark wash in dark', () => {
    system('ios', 'dark');
    const washed = draw(header)
      .root.findAllByType(View)
      .map((node) => flat(node.props.style))
      .filter(
        (style) =>
          style.backgroundColor === partyWash('Australian Greens', 'dark'),
      );
    expect(washed.length).toBeGreaterThan(0);
    // The plate spans the column and holds its own padding.
    expect(washed[0]).toMatchObject({ alignSelf: 'stretch', padding: 16 });
  });

  test('has no wash and no added padding in light', () => {
    system('ios', 'light');
    const styles = draw(header)
      .root.findAllByType(View)
      .map((node) => flat(node.props.style));
    for (const style of styles) {
      expect(style.backgroundColor).not.toBe(
        partyWash('Australian Greens', 'light'),
      );
      expect(style.backgroundColor).not.toBe(
        partyWash('Australian Greens', 'dark'),
      );
      expect(style.padding).toBeUndefined();
    }
  });

  test('a person’s header takes no wash in dark', () => {
    system('ios', 'dark');
    const tree = draw(<ProfileHeader name="A Member" testID="person" />);
    expect(grounds(tree)).toEqual([]);
  });
});

describe('pull to refresh', () => {
  const control = (tree: TestRenderer.ReactTestRenderer) =>
    tree.root.findByType(RefreshControl).props;

  test('Android draws the navy arrow on the raised disc of the scheme', () => {
    system('android', 'dark');
    const props = control(
      draw(<PullRefresh refreshing={false} onRefresh={jest.fn()} />),
    );
    expect(props.colors).toEqual([dark.navy]);
    expect(props.progressBackgroundColor).toBe(dark.raised);
  });

  test('and the light pair in light', () => {
    system('android', 'light');
    const props = control(
      draw(<PullRefresh refreshing={false} onRefresh={jest.fn()} />),
    );
    expect(props.colors).toEqual([light.navy]);
    expect(props.progressBackgroundColor).toBe(light.raised);
  });

  test('iOS gets only what the screen passes', () => {
    system('ios', 'dark');
    const refresh = jest.fn();
    const props = control(
      draw(<PullRefresh refreshing onRefresh={refresh} tintColor="red" />),
    );
    expect(props.colors).toBeUndefined();
    expect(props.progressBackgroundColor).toBeUndefined();
    expect(props).toMatchObject({
      refreshing: true,
      onRefresh: refresh,
      tintColor: 'red',
    });
  });

  test('Android: a scroll view’s clone reaches the system control, style and child', () => {
    // ScrollView on Android clones its refresh control with its own style
    // and puts the scrolling view inside it. A wrapper that dropped either
    // would draw an empty or unsized page.
    system('android', 'dark');
    const refresh = jest.fn();
    const tree = draw(
      cloneElement(
        <PullRefresh refreshing={false} onRefresh={refresh} />,
        { style: { flex: 1 } },
        <View testID="inner" />,
      ),
    );
    const native = tree.root.findByType(RefreshControl);
    expect(native.props.style).toEqual({ flex: 1 });
    // Jest's stand-in for the system control draws no children, so the
    // child is read from the props it was handed.
    expect(native.props.children).toEqual(<View testID="inner" />);
    expect(native.props).toMatchObject({
      refreshing: false,
      onRefresh: refresh,
      colors: [dark.navy],
      progressBackgroundColor: dark.raised,
    });
  });
});

describe('the electorate outline', () => {
  test('keeps its light recipe', () => {
    expect(outlineColours('sunken', 'light')).toEqual({
      fill: light.navyWash,
      stroke: light.navy,
    });
  });
});
