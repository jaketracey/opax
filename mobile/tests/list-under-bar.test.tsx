// A large-title page whose list is not a Screen reports when it has
// scrolled under the bar, for the solid bar of Reduce Transparency and
// Increase Contrast (RT27-title).
import { act, useLayoutEffect } from 'react';
import { Platform } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useListUnderBar } from '../src/navigation/useListUnderBar';
import { useRootBarUnderBar } from '../src/navigation/useRootBarAppearance';

let mockSolidBar = false;
jest.mock('../src/design/accessibility', () => ({
  useSolidBar: () => mockSolidBar,
}));
jest.mock('../src/design/useHeaderBottom', () => ({
  useHeaderBottom: () => 100,
}));
jest.mock('../src/navigation/useRootBarAppearance', () => ({
  useRootBarUnderBar: jest.fn(),
}));

type Hook = ReturnType<typeof useListUnderBar>;
let hook: Hook;
const see = (next: Hook) => {
  hook = next;
};
function Page({ enabled }: { enabled?: boolean }) {
  const next = useListUnderBar(enabled);
  // Handed out after each draw, as a list would receive it.
  useLayoutEffect(() => see(next));
  return null;
}
const os = Platform.OS;
let renderer: TestRenderer.ReactTestRenderer;
const mount = (enabled?: boolean) =>
  act(() => {
    renderer = TestRenderer.create(<Page enabled={enabled} />);
  });
const redraw = (enabled?: boolean) =>
  act(() => renderer.update(<Page enabled={enabled} />));
const scroll = (y: number) =>
  act(() => hook.onScroll({ nativeEvent: { contentOffset: { y } } } as never));
/** What the page last told the bar: under the bar, and whether it reports. */
const report = () => {
  const [underBar, enabled, withdraw] = jest
    .mocked(useRootBarUnderBar)
    .mock.calls.at(-1)!;
  return { underBar, enabled, withdraw };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSolidBar = false;
  Platform.OS = 'ios';
});
afterEach(() => {
  act(() => renderer.unmount());
  Platform.OS = os;
});

test('with neither setting on, nothing is reported, and a report is one that is withdrawn', () => {
  mount();
  expect(hook.reports).toBe(false);
  expect(report()).toEqual({ underBar: false, enabled: false, withdraw: true });
});

test('with a solid bar: at rest, under the bar from the first point of scroll, and at rest again', () => {
  mockSolidBar = true;
  mount();
  expect(hook.reports).toBe(true);
  expect(report()).toMatchObject({ underBar: false, enabled: true });
  // At rest the list's top inset holds it at the bar's foot.
  scroll(-100);
  expect(report()).toMatchObject({ underBar: false, enabled: true });
  scroll(-98);
  expect(report()).toMatchObject({ underBar: true, enabled: true });
  scroll(400);
  expect(report()).toMatchObject({ underBar: true, enabled: true });
  scroll(-100);
  expect(report()).toMatchObject({ underBar: false, enabled: true });
});

test('a setting that turns on with the list already scrolled makes the bar solid at once, with no scroll', () => {
  mount();
  // The list is heard while the setting is off (its fade listens anyway).
  scroll(400);
  expect(report()).toMatchObject({ enabled: false });
  mockSolidBar = true;
  redraw();
  expect(report()).toMatchObject({ underBar: true, enabled: true });
  // And off again: nothing is reported.
  mockSolidBar = false;
  redraw();
  expect(report()).toMatchObject({ enabled: false });
  // Back on at rest: the title is left uncovered.
  scroll(-100);
  mockSolidBar = true;
  redraw();
  expect(report()).toMatchObject({ underBar: false, enabled: true });
});

test('a setting that turns on over a list that was not heard reports nothing until it scrolls, so the bar keeps its ground', () => {
  mount();
  mockSolidBar = true;
  redraw();
  // Where the list is cannot be known: unreported, the bar stays solid.
  expect(hook.reports).toBe(true);
  expect(report()).toMatchObject({ enabled: false });
  scroll(250);
  expect(report()).toMatchObject({ underBar: true, enabled: true });
});

test('a page that is not its bar’s owner (a pushed list), and Android, report nothing', () => {
  mockSolidBar = true;
  mount(false);
  expect(hook.reports).toBe(false);
  expect(report()).toMatchObject({ enabled: false });
  act(() => renderer.unmount());
  Platform.OS = 'android';
  mount();
  expect(hook.reports).toBe(false);
  expect(report()).toMatchObject({ enabled: false });
});
