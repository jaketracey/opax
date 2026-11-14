// b67: after a first-run seat choice, Your MP opened scrolled down, the seat
// line and the member card's top under the bar (iOS 27, 26.3.1, 18.x).
// React Native's keyboard handler hears every keyboard in the window. The
// seat chooser's search keyboard, in the sheet over Your MP, re-applied the
// page's offset through a clamp that ignores UIKit's automatic top inset:
// the rest under the large title (-headerBottom) became 0. Your MP has no
// text field, so it takes no keyboard insets, and each federal seat draws
// in a fresh scroll view, at its rest under the expanded title.
import { act, type ReactElement } from 'react';
import { ScrollView, Text as NativeText } from 'react-native';
import TestRenderer from 'react-test-renderer';
import * as c from '../src/api/catalogs';
import { catalogs as runtime } from '../src/api/runtime';
import { Screen } from '../src/design/layout';
import YourMP from '../src/features/YourMP';
import {
  loadChoice,
  saveChoice,
  subscribeChoice,
} from '../src/features/your-mp/choice-store';
import { resetSeatForTests } from '../src/features/your-mp/useSeat';
import { withNavigationOptions } from './navigation-options';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';

const mockScreens = { mounts: 0 };
jest.mock('../src/design/layout', () => {
  const actual = jest.requireActual('../src/design/layout');
  const React = jest.requireActual('react');
  return {
    ...actual,
    // The real Screen, counting the scroll views it mounts.
    Screen: (props: object) => {
      React.useEffect(() => {
        mockScreens.mounts++;
      }, []);
      return React.createElement(actual.Screen, props);
    },
  };
});
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    directory: jest.fn(),
    yourMP: jest.fn(),
    profileFor: jest.fn(),
    electorateFor: jest.fn(),
    bills: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
  forgetChoice: jest.fn(async () => undefined),
  subscribeChoice: jest.fn(() => () => undefined),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('../src/features/ask/open', () => ({
  useOpenAsk: () => jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Link: Object.assign(({ children }: { children?: unknown }) => children, {
    Trigger: ({ children }: { children?: unknown }) => children,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  Stack: { Screen: () => null },
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const mock = runtime as jest.Mocked<typeof runtime>;
const never = () => new Promise<never>(() => undefined);
const seatNamed = (name: string) =>
  index.electorates.find((s) => s.name === name)!;

async function render(element: ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(withNavigationOptions(element, () => undefined));
  });
  return r;
}
/** The page's native scroll view: its keyboard props as UIKit gets them. */
const scrollView = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll(
    (n) =>
      n.type === ScrollView &&
      n.props.testID === testID &&
      'automaticallyAdjustKeyboardInsets' in n.props,
  )[0]!;
const has = (r: TestRenderer.ReactTestRenderer, testID: string) =>
  r.root.findAll((n) => n.props.testID === testID).length > 0;
/** What the seat store hears from choice-store when a choice is saved. */
const publish = (seatId: string | null) =>
  act(async () => {
    (subscribeChoice as jest.Mock).mock.calls.at(-1)?.[0](
      seatId ? { version: 1, seatId, stateSeatIds: [] } : null,
    );
  });

beforeEach(() => {
  jest.clearAllMocks();
  resetSeatForTests();
  mockScreens.mounts = 0;
  mock.directory.mockResolvedValue({
    manifest: result(manifest),
    people: result(people),
    roster: result(roster),
    slugs: result(slugs),
    electorates: result(index),
  } as never);
  mock.profileFor.mockImplementation(
    async (id) => c.profileFor(id, catalogs) as never,
  );
  mock.electorateFor.mockImplementation(never);
  mock.bills.mockImplementation(never);
  (saveChoice as jest.Mock).mockResolvedValue(undefined);
});

test('the seat chooser keyboard over Your MP cannot move it: no keyboard insets', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  const r = await render(<YourMP />);
  expect(has(r, 'your-invitation')).toBe(true);
  expect(
    scrollView(r, 'your-mp-screen').props.automaticallyAdjustKeyboardInsets,
  ).toBe(false);
  const grayndler = seatNamed('Grayndler');
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(grayndler.electorate_id, index, manifest),
  );
  await publish(grayndler.electorate_id);
  expect(has(r, 'your-seat-name')).toBe(true);
  expect(
    scrollView(r, 'your-mp-screen').props.automaticallyAdjustKeyboardInsets,
  ).toBe(false);
  await act(async () => r.unmount());
});

test('other pages keep keyboard insets by default', async () => {
  const r = await render(
    <Screen testID="plain">
      <NativeText>Body</NativeText>
    </Screen>,
  );
  expect(scrollView(r, 'plain').props.automaticallyAdjustKeyboardInsets).toBe(
    true,
  );
  await act(async () => r.unmount());
});

test('a first choice and a changed seat each open in a fresh scroll view; loading the seat keeps it', async () => {
  (loadChoice as jest.Mock).mockResolvedValue(null);
  const grayndler = seatNamed('Grayndler');
  const sydney = seatNamed('Sydney');
  let resolveView!: (v: unknown) => void;
  mock.yourMP.mockReturnValue(
    new Promise((resolve) => {
      resolveView = resolve;
    }) as never,
  );
  const r = await render(<YourMP />);
  expect(has(r, 'your-invitation')).toBe(true);
  const invitation = mockScreens.mounts;
  // The first choice, saved from the sheet over the page.
  await publish(grayndler.electorate_id);
  expect(has(r, 'your-seat-name')).toBe(true);
  expect(mockScreens.mounts).toBe(invitation + 1);
  const chosen = mockScreens.mounts;
  // Its member and records arriving keep that scroll view.
  await act(async () => {
    resolveView(c.yourMPFor(grayndler.electorate_id, index, manifest));
  });
  await act(async () => {});
  expect(has(r, 'your-member-anthony-albanese')).toBe(true);
  expect(mockScreens.mounts).toBe(chosen);
  // Change electorate, from further down the page: the new seat's own top.
  mock.yourMP.mockResolvedValue(
    c.yourMPFor(sydney.electorate_id, index, manifest),
  );
  await publish(sydney.electorate_id);
  expect(mockScreens.mounts).toBe(chosen + 1);
  // Forget: the invitation, at its top too.
  await publish(null);
  expect(has(r, 'your-invitation')).toBe(true);
  expect(mockScreens.mounts).toBe(chosen + 2);
  await act(async () => r.unmount());
});
