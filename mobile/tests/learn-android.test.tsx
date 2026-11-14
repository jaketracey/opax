/* eslint-disable @typescript-eslint/no-require-imports -- Android native host doubles. */
import { router } from 'expo-router';
import { act, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { resetTermClaimsForTests, Term, TermText } from '../src/design/term';
import { Text } from '../src/design/text';
import AccountTerms from '../src/features/learn/AccountLearn';
import GlossaryScreen from '../src/features/learn/GlossaryScreen';
import LearnChapter from '../src/features/learn/LearnChapter';
import { LearnCard } from '../src/features/learn/LearnCard';
import LearnHub from '../src/features/learn/LearnHub';
import { resetLearnSettingsForTests } from '../src/features/learn/settings';
import TermSheet from '../src/features/learn/TermSheet';
import TermTip from '../src/features/learn/TermTip';

// The Android JS check for the guide (no emulator on the Mac): every screen
// and the inline term draw with Platform.OS android and Compose doubled.
let mockFontScale = 1;
jest.mock('react-native', () => {
  const rn = jest.requireActual('react-native');
  Object.defineProperty(rn.Platform, 'OS', { get: () => 'android' });
  rn.UIManager.measureInWindow = jest.fn();
  return rn;
});
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 412,
    height: 915,
    scale: 2.625,
    fontScale: mockFontScale,
  }),
}));
jest.mock('@expo/ui/jetpack-compose', () => {
  const React = require('react');
  function part(name: string) {
    return function MaterialPart(props: Record<string, unknown>) {
      return React.createElement(name, props, props.children);
    };
  }
  return { Host: part('MaterialHost'), Switch: part('MaterialSwitch') };
});
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    get exists() {
      return false;
    }
    async text() {
      return '';
    }
    write() {}
  },
}));
jest.mock('../src/onboarding/state', () => ({ tourSeen: async () => true }));
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
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
    ...jest.requireActual('expo-router'),
    Link,
    router: {
      push: jest.fn(),
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    },
    Stack: { Screen: () => null },
    useLocalSearchParams: () => mockParams,
  };
});
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

const mounted: TestRenderer.ReactTestRenderer[] = [];
function render(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  mounted.push(tree);
  return tree;
}
beforeEach(() => {
  mockParams = {};
  mockFontScale = 1;
  (router.push as jest.Mock).mockClear();
  resetTermClaimsForTests();
  resetLearnSettingsForTests({ card: 'show' });
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((tree) => tree.unmount()));
});

test('Android draws the term with a solid underline in soft ink', () => {
  const tree = render(
    <Text>
      <Term id="senate" />
    </Text>,
  );
  const run = tree.root.findAll(
    (node) =>
      node.props.testID === 'term-inline-senate' &&
      typeof node.type === 'string',
  )[0]!;
  expect(StyleSheet.flatten(run.props.style)).toMatchObject({
    textDecorationLine: 'underline',
    textDecorationStyle: 'solid',
  });
});

test('standing text keeps its TalkBack action on Android', () => {
  const tree = render(
    <TermText term="division" testID="stat">
      12 divisions
    </TermText>,
  );
  const line = tree.root.findAll(
    (node) => node.props.testID === 'stat' && typeof node.type === 'string',
  )[0]!;
  expect(line.props.accessibilityActions).toContainEqual({
    name: 'explain-division',
    label: 'Explain division',
  });
});

test.each([1, 3.1])(
  'every guide screen draws on Android at font scale %s',
  async (scale) => {
    mockFontScale = scale;
    render(<LearnHub />);
    // Opening the guide hides Home's card; let that save land in act.
    await act(async () => undefined);
    render(<GlossaryScreen />);
    render(<LearnCard />);
    render(<AccountTerms />);
    mockParams = { chapter: 'how-votes-work' };
    render(<LearnChapter />);
    mockParams = { id: 'division' };
    render(<TermSheet />);
    mockParams = { id: 'pair', x: '200', y: '600' };
    render(<TermTip />);
  },
);
