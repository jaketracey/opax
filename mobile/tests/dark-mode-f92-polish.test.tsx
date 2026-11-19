/* eslint-disable @typescript-eslint/no-require-imports -- Fresh module copies for the cold launch. */
// Build 92 polish for dark mode (20 Nov 2026): the blank portrait circle
// reads as a placeholder on dark grounds, the scheme hold in `useIsDark()`
// is for iOS only and right at a cold launch, and the neutral capsule's edge
// is the card's hairline. Each test fails if its change is reverted.
import { act, type ReactElement } from 'react';
import { Appearance, AppState, Platform, StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { CachedPortrait } from '../src/features/CachedPortrait';
import { contrastRatio } from '../src/design/contrast';
import { StatusCapsule } from '../src/design/labels';
import { dark, light } from '../src/design/palette';
import { FaceStack, Portrait } from '../src/design/people';
import { hairline } from '../src/design/tokens';
import { useIsDark } from '../src/design/use-colors';

// The hairline token is 1pt, the width the capsule's edge had as a bare
// number. A different value here shows which of the two the capsule reads.
jest.mock('../src/design/tokens', () => ({
  ...jest.requireActual('../src/design/tokens'),
  hairline: 0.5,
}));
// No portrait store: every lookup ends on the blank circle.
jest.mock('../src/api/runtime', () => ({ portraits: null }));

const originalOS = Platform.OS;
const originalState = AppState.currentState;
let scheme: 'light' | 'dark' = 'light';
let schemeListeners: (() => void)[] = [];
let stateListeners: ((state: string) => void)[] = [];
beforeEach(() => {
  scheme = 'light';
  schemeListeners = [];
  stateListeners = [];
  AppState.currentState = 'active';
  jest.spyOn(Appearance, 'getColorScheme').mockImplementation(() => scheme);
  jest.spyOn(Appearance, 'addChangeListener').mockImplementation((listener) => {
    schemeListeners.push(listener as () => void);
    return {
      remove: () => {
        schemeListeners = schemeListeners.filter((l) => l !== listener);
      },
    } as never;
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event: string, listener: unknown) => {
      if (event === 'change')
        stateListeners.push(listener as (state: string) => void);
      return {
        remove: () => {
          stateListeners = stateListeners.filter((l) => l !== listener);
        },
      } as never;
    });
});
afterEach(() => {
  Platform.OS = originalOS;
  AppState.currentState = originalState;
  jest.restoreAllMocks();
});

function draw(element: ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(element);
  });
  return tree;
}
type Flat = Record<string, unknown>;
const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Flat;
/** Every circle a tree draws: the host views as wide as they are tall and fully rounded. */
function circles(tree: TestRenderer.ReactTestRenderer): Flat[] {
  return tree.root
    .findAll((node) => typeof node.type === 'string')
    .map((node) => flat(node.props.style))
    .filter(
      (style) =>
        typeof style.width === 'number' &&
        style.width === style.height &&
        style.borderRadius === style.width / 2 &&
        style.backgroundColor !== undefined,
    );
}

describe('the blank portrait circle', () => {
  // Wherever a person has no portrait: a row, a lookup that found nothing,
  // and a face stack's empty places.
  const blanks: [string, () => ReactElement, number][] = [
    ['a named row', () => <Portrait name="A Member" />, 1],
    ['a lookup with no portrait', () => <CachedPortrait name="A Member" />, 1],
    ['a face stack', () => <FaceStack portraits={[null, null, null]} />, 3],
  ];

  test.each(blanks)(
    'in dark, %s stands off every ground it is drawn on',
    (_name, element, count) => {
      Platform.OS = 'android';
      scheme = 'dark';
      const drawn = circles(draw(element()));
      expect(drawn).toHaveLength(count);
      for (const circle of drawn) {
        const fill = circle.backgroundColor as string;
        expect(fill).toBe(dark.portraitBlank);
        // The page, a raised card and a grouped (sunken) page. 1.5:1 is the
        // least that reads as a mark; dark sunken, the old fill, was 1.08:1
        // from paper and 1.21:1 from raised, and darker than both.
        for (const ground of [dark.paper, dark.raised, dark.sunken])
          expect(contrastRatio(fill, ground)).toBeGreaterThanOrEqual(1.5);
      }
    },
  );

  test('the dark tone is lighter than the grounds, so it is a mark and not a hole', () => {
    const value = (hex: string) => parseInt(hex.slice(1), 16);
    for (const ground of [dark.paper, dark.raised, dark.sunken])
      expect(value(dark.portraitBlank)).toBeGreaterThan(value(ground));
    expect(contrastRatio(dark.portraitBlank, dark.raised)).toBeCloseTo(1.73, 2);
    expect(contrastRatio(dark.portraitBlank, dark.paper)).toBeCloseTo(1.95, 2);
  });

  test.each(blanks)('in light, %s is drawn as before', (_name, element) => {
    Platform.OS = 'android';
    for (const circle of circles(draw(element())))
      expect(circle).toMatchObject({
        backgroundColor: '#F1EFE8',
        borderColor: light.dividerSubtle,
      });
    expect(light.portraitBlank).toBe(light.sunken);
  });

  test('a named person gets no initials and no symbol', () => {
    Platform.OS = 'android';
    scheme = 'dark';
    const tree = draw(<Portrait name="A Member" />);
    expect(JSON.stringify(tree.toJSON())).not.toMatch(/"children":\["/);
    expect(
      tree.root.findAll((node) => typeof node.type === 'string'),
    ).toHaveLength(2);
  });
});

describe('the scheme hold in useIsDark is for iOS', () => {
  function probe() {
    const seen = { dark: false, renders: 0 };
    function Probe() {
      seen.dark = useIsDark();
      seen.renders += 1;
      return null;
    }
    draw(<Probe />);
    return seen;
  }
  function systemScheme(next: 'light' | 'dark') {
    scheme = next;
    act(() => [...schemeListeners].forEach((listener) => listener()));
  }

  test.each(['inactive', 'background'] as const)(
    'Android follows a change at once while the app is %s',
    (state) => {
      Platform.OS = 'android';
      const seen = probe();
      expect(seen.dark).toBe(false);
      AppState.currentState = state;
      act(() => [...stateListeners].forEach((listener) => listener(state)));
      // No resume: the scheme event alone must carry it, as it does for
      // `useColors()`.
      systemScheme('dark');
      expect(seen.dark).toBe(true);
      expect(seen.renders).toBe(2);
    },
  );

  test('iOS still holds while the app is behind', () => {
    Platform.OS = 'ios';
    const seen = probe();
    AppState.currentState = 'background';
    act(() => [...stateListeners].forEach((l) => l('background')));
    systemScheme('dark');
    expect(seen.dark).toBe(false);
    expect(seen.renders).toBe(1);
  });

  // iOS reports `inactive` during a launch, and `background` for one begun
  // by a push or a widget. Nothing is held yet, so the first draw must ask
  // the system; without that it would be light until the first `active`.
  test.each(['inactive', 'background'] as const)(
    'a cold launch on iOS that starts %s in a dark system is dark on the first draw',
    (state) => {
      let first: boolean | undefined;
      jest.isolateModules(() => {
        // Fresh copies throughout: the held answer is module state, and the
        // hook must run under the same React as its renderer.
        const React = require('react') as typeof import('react');
        const RN = require('react-native') as typeof import('react-native');
        const Renderer =
          require('react-test-renderer') as typeof import('react-test-renderer');
        RN.Platform.OS = 'ios';
        RN.AppState.currentState = state;
        jest.spyOn(RN.Appearance, 'getColorScheme').mockReturnValue('dark');
        const fresh =
          require('../src/design/use-colors') as typeof import('../src/design/use-colors');
        function Probe() {
          const isDark = fresh.useIsDark();
          first ??= isDark;
          return null;
        }
        React.act(() => {
          Renderer.create(React.createElement(Probe));
        });
      });
      expect(first).toBe(true);
    },
  );
});

test('the neutral capsule takes the hairline token for its edge, as a card does', () => {
  Platform.OS = 'android';
  scheme = 'dark';
  expect(hairline).toBe(0.5);
  const tree = draw(<StatusCapsule status="Passed" />);
  const edged = tree.root
    .findAll((node) => typeof node.type === 'string')
    .map((node) => flat(node.props.style))
    .find((style) => style.outlineColor === dark.raisedOutline);
  expect(edged).toMatchObject({
    outlineWidth: hairline,
    outlineOffset: -hairline,
    outlineStyle: 'solid',
  });
});
