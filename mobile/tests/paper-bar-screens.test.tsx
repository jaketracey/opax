// The A to Z glossary and the photo credits are reference lists on paper
// under a paper bar. On Android a colour role is chosen in JavaScript, so
// the bar's ground must be read through a hook that draws the page again
// when the system's appearance changes. Both pages once spread an object of
// getters, which read the right paper only if something else drew the page
// again (build 92 follow-up to the dark mode review of Ask and sheets).
import { act, type ReactElement } from 'react';
import { Appearance, Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { dark, light } from '../src/design/palette';
import { PhotoCreditsList } from '../src/features/explore/PhotoCredits';
import Glossary from '../src/features/learn/GlossaryScreen';
import { opaqueBar } from '../src/navigation/chrome';
import { withNavigationOptions } from './navigation-options';

// The options each page hands to its route, as the page wrote them.
const mockSet: { current: Record<string, unknown> } = { current: {} };
jest.mock('../src/navigation/preview', () => ({
  ...jest.requireActual('../src/navigation/preview'),
  RouteOptions: ({ options }: { options: Record<string, unknown> }) => {
    mockSet.current = options;
    return null;
  },
}));
// Style sheets stay on the light set and never draw a page again. The photo
// credits page calls `useStyles()` itself, which redraws it on a switch and
// would let a bar read at render pass by accident (review of #519). With the
// sheets still, the bar hook is the only thing that can give the page the
// new paper, on both pages.
jest.mock('../src/design/use-colors', () => {
  const actual = jest.requireActual('../src/design/use-colors');
  return {
    ...actual,
    makeStyles: (factory: (colors: unknown) => unknown) => {
      let sheet: unknown;
      return () => (sheet ??= factory(actual.colorsFor('light')));
    },
  };
});
jest.mock('../src/features/explore/runtime', () => ({
  // Never settles: the list stays in its loading state under the bar.
  explore: { pictures: () => new Promise(() => {}) },
}));

const os = Platform.OS;
let scheme: 'light' | 'dark' = 'light';
let listeners: (() => void)[] = [];
beforeEach(() => {
  Platform.OS = 'android';
  scheme = 'light';
  listeners = [];
  mockSet.current = {};
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => scheme);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation(((
    listener: () => void,
  ) => {
    listeners.push(listener);
    return {
      remove: () => {
        listeners = listeners.filter((held) => held !== listener);
      },
    };
  }) as never);
});
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = os;
});

const bar = () => ({
  headerShadowVisible: mockSet.current.headerShadowVisible,
  headerStyle: mockSet.current.headerStyle,
  headerLargeStyle: mockSet.current.headerLargeStyle,
});

test.each<[string, () => ReactElement, string]>([
  ['the A to Z glossary', () => <Glossary />, 'A to Z glossary'],
  [
    'the photograph credits',
    () => <PhotoCreditsList />,
    'Time machine photographs',
  ],
])(
  'Android: %s gives its bar the new paper when the system switches',
  async (_name, page, title) => {
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        withNavigationOptions(page(), () => undefined),
      );
    });
    expect(mockSet.current.title).toBe(title);
    expect(bar()).toEqual(opaqueBar(light.paper));

    // The system turns dark with the page open. Nothing else changes.
    await act(async () => {
      scheme = 'dark';
      listeners.forEach((changed) => changed());
    });
    expect(bar()).toEqual(opaqueBar(dark.paper));
    expect(dark.paper).not.toBe(light.paper);

    // And back.
    await act(async () => {
      scheme = 'light';
      listeners.forEach((changed) => changed());
    });
    expect(bar()).toEqual(opaqueBar(light.paper));
    await act(async () => tree.unmount());
  },
);
