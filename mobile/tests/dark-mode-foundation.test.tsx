import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import * as Native from 'react-native';
import {
  AccessibilityInfo,
  Appearance,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { Card } from '../src/design/card';
import { dark, light } from '../src/design/palette';
import { partyWash } from '../src/design/party';
import { Text } from '../src/design/text';
import { colors, schemeColour } from '../src/design/tokens';
import { currentColors } from '../src/design/use-colors';
import { coverBarStyle } from '../src/launch/LaunchHandoff';
import { AndroidBottomSheet } from '../src/navigation/AndroidSheet';
import { androidStatusBarStyle, opaqueBar } from '../src/navigation/chrome';
import { sheetOptions } from '../src/navigation/stack/screen';

// Dark mode foundation (19 Nov 2026): what the shared files draw on Android
// when the system is dark, and that iOS keeps its dynamic roles. Each test
// fails if its behaviour is reverted.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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
const flat = (style: unknown) => StyleSheet.flatten(style as never) as never;
function draw(element: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}

describe('system bars', () => {
  test('Android status bar icons read on the page in either scheme', () => {
    expect(androidStatusBarStyle('light')).toBe('dark');
    expect(androidStatusBarStyle(null)).toBe('dark');
    expect(androidStatusBarStyle(undefined)).toBe('dark');
    // Dark icons on the dark page would be invisible.
    expect(androidStatusBarStyle('dark')).toBe('light');
  });

  test('the launch cover hands over to the page icons, which are light on a dark page', () => {
    // On the navy field: light, everywhere.
    for (const scheme of ['light', 'dark'] as const)
      for (const os of ['ios', 'android'])
        expect(coverBarStyle(os, false, scheme)).toBe('light');
    // Halfway through the fade the page shows.
    expect(coverBarStyle('android', true, 'light')).toBe('dark');
    expect(coverBarStyle('android', true, 'dark')).toBe('light');
    expect(coverBarStyle('android', true)).toBe('dark');
    // iOS keeps light until the cover unmounts.
    expect(coverBarStyle('ios', true, 'light')).toBe('light');
  });
});

describe('Android takes the scheme, iOS keeps its dynamic roles', () => {
  test('text is the dark ink on Android in dark', () => {
    system('android', 'dark');
    const tree = draw(<Text>Grayndler</Text>);
    const colour = (
      flat(tree.root.findByType(Native.Text).props.style) as { color: string }
    ).color;
    expect(colour).toBe(dark.ink);
    expect(colour).not.toBe(light.ink);
  });

  test('text on iOS is the same dynamic role in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      system('ios', scheme);
      const tree = draw(<Text>Grayndler</Text>);
      expect(
        (
          flat(tree.root.findByType(Native.Text).props.style) as {
            color: object;
          }
        ).color,
      ).toBe(colors.ink);
    }
  });

  test('a bar helper called with no ground takes the page ground on screen', () => {
    system('android', 'dark');
    expect(opaqueBar().headerStyle.backgroundColor).toBe(dark.paper);
    system('android', 'light');
    expect(opaqueBar().headerStyle.backgroundColor).toBe(light.paper);
    system('ios', 'dark');
    expect(opaqueBar().headerStyle.backgroundColor).toBe(colors.paper);
  });

  test('the shared sheet options read the ground at each spread, not at import', () => {
    system('android', 'dark');
    expect({ ...sheetOptions }.headerStyle).toEqual({
      backgroundColor: dark.paper,
    });
    system('android', 'light');
    expect({ ...sheetOptions }.headerStyle).toEqual({
      backgroundColor: light.paper,
    });
    expect({ ...sheetOptions }.headerLargeStyle).toEqual({
      backgroundColor: light.paper,
    });
  });

  test('a bar title resolves in the scheme on Android too', () => {
    Platform.OS = 'android';
    expect(schemeColour('ink', 'dark')).toBe(dark.ink);
    expect(schemeColour('ink', 'light')).toBe(light.ink);
    expect(schemeColour('ink', null)).toBe(light.ink);
  });

  test('outside render iOS asks the system nothing', () => {
    Platform.OS = 'ios';
    const scheme = jest.spyOn(Appearance, 'getColorScheme');
    const contrast = jest.spyOn(AccessibilityInfo, 'isHighTextContrastEnabled');
    // Both are jest mocks already: count from here.
    scheme.mockClear();
    contrast.mockClear();
    expect(currentColors()).toBe(colors);
    expect(scheme).not.toHaveBeenCalled();
    expect(contrast).not.toHaveBeenCalled();
  });
});

describe('elevation in dark', () => {
  const face = (tree: TestRenderer.ReactTestRenderer) =>
    flat(
      tree.root.findAll(
        (node) => typeof node.type === 'string' && node.props.testID === 'card',
      )[0]!.props.style,
    ) as {
      backgroundColor: unknown;
      outlineColor?: unknown;
      outlineWidth?: number;
      outlineOffset?: number;
      borderWidth?: number;
    };

  test('a raised card takes the dark outline on Android, and no border that would move its content', () => {
    system('android', 'dark');
    const card = face(
      draw(
        <Card testID="card">
          <View />
        </Card>,
      ),
    );
    expect(card.backgroundColor).toBe(dark.raised);
    expect(card.outlineColor).toBe(dark.raisedOutline);
    expect(card.outlineWidth).toBe(1);
    expect(card.outlineOffset).toBe(-1);
    expect(card.borderWidth).toBeUndefined();
  });

  test('in light the same outline is clear, so the card draws as before', () => {
    system('android', 'light');
    const card = face(
      draw(
        <Card testID="card">
          <View />
        </Card>,
      ),
    );
    expect(card.backgroundColor).toBe(light.raised);
    expect(card.outlineColor).toBe('rgba(0,0,0,0)');
  });

  test('a card on its own ground has its own edge and takes no outline', () => {
    system('android', 'dark');
    const card = face(
      draw(
        <Card testID="card" ground="bandPeople">
          <View />
        </Card>,
      ),
    );
    expect(card.backgroundColor).toBe(dark.bandPeople);
    expect(card.outlineColor).toBeUndefined();
  });
});

describe('the sheet scrim', () => {
  const scrim = (tree: TestRenderer.ReactTestRenderer) =>
    flat(
      tree.root.findAll(
        (node) =>
          typeof node.type === 'string' &&
          node.props.accessibilityLabel === 'Done',
      )[0]!.props.style,
    ) as { backgroundColor: string; opacity?: number };

  test.each([
    ['light', 'rgba(35,39,31,0.4)'],
    ['dark', 'rgba(0,0,0,0.6)'],
  ] as const)('%s: %s, a role and not ink plus opacity', (scheme, expected) => {
    system('android', scheme);
    const tree = draw(
      <AndroidBottomSheet title="Sort" onClose={jest.fn()}>
        <View />
      </AndroidBottomSheet>,
    );
    const drawn = scrim(tree);
    expect(drawn.backgroundColor).toBe(expected);
    // Ink at 40% turned into a pale veil in dark: the alpha is in the role.
    expect(drawn.opacity).toBeUndefined();
    act(() => tree.unmount());
  });
});

describe('party colour', () => {
  test('a party header takes its dark wash in dark', () => {
    expect(partyWash('Australian Labor Party')).toBe('#F1E1DF');
    expect(partyWash('Australian Labor Party', 'light')).toBe('#F1E1DF');
    expect(partyWash('Australian Labor Party', 'dark')).toBe('#3A2324');
    // Unknown and missing parties keep the neutral wash, in its own scheme.
    expect(partyWash(null, 'dark')).toBe(partyWash('Not a party', 'dark'));
    expect(partyWash(null, 'dark')).not.toBe(partyWash(null, 'light'));
  });
});
