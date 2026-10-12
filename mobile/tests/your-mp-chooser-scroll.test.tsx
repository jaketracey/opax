// Pass 5 lane B: "Use my location" sits below the field, so a seat is often
// confirmed from further down the chooser. The chosen seat must not keep the
// chooser's offset (device journeys 09 and 24, 12 Oct), and a negative
// scrollTo stops at 0, behind the bar: the chooser and the page each draw in
// a fresh scroll view, at its rest position.
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';
import YourMP from '../src/features/YourMP';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';

const mockScreens = { mounts: 0 };
jest.mock('../src/design/primitives', () => {
  const actual = jest.requireActual('../src/design/primitives');
  const React = jest.requireActual('react');
  return {
    ...actual,
    // The real screen's scroll view, as far as its mounts go.
    Screen: (p: { children?: unknown }) => {
      React.useEffect(() => {
        mockScreens.mounts++;
      }, []);
      return React.createElement(React.Fragment, null, p.children);
    },
  };
});
jest.mock('../src/api/runtime', () => ({
  portraits: { get: jest.fn() },
  catalogs: {
    directory: jest.fn(),
    yourMP: jest.fn(),
    profileFor: jest.fn(),
  },
}));
jest.mock('../src/features/your-mp/choice-store', () => ({
  loadChoice: jest.fn(),
  saveChoice: jest.fn(),
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn() },
  Stack: { Screen: () => null },
}));
const result = <T,>(data: T) => ({
  data,
  stale: false,
  savedAt: 1,
  asOf: null,
});
const mock = runtime as jest.Mocked<typeof runtime>;

test('the chooser and the chosen seat each draw in a fresh scroll view, whatever the chooser offset', async () => {
  const seat = index.electorates.find((s) => s.name === 'Grayndler')!;
  mock.directory.mockResolvedValue({
    manifest: result(manifest),
    people: result(people),
    roster: result(roster),
    slugs: result(slugs),
    electorates: result(index),
  });
  (loadChoice as jest.Mock).mockResolvedValue(null);
  (saveChoice as jest.Mock).mockResolvedValue(undefined);
  let resolveView!: (v: unknown) => void;
  mock.yourMP.mockReturnValue(
    new Promise((resolve) => {
      resolveView = resolve;
    }) as never,
  );
  mock.profileFor.mockResolvedValue(
    c.profileFor(seat.representatives[0]!.person_id, catalogs),
  );
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<YourMP />);
  });
  const opened = mockScreens.mounts;
  const find = (id: string, key: 'onPress' | 'onChangeText') =>
    r.root.find(
      (n) => n.props.testID === id && typeof n.props[key] === 'function',
    );
  await act(async () => {
    find('seat-search', 'onChangeText').props.onChangeText('Grayndler');
  });
  // Typing and the result list keep the chooser's scroll view.
  expect(mockScreens.mounts).toBe(opened);
  await act(async () => {
    find(`seat-choice-${seat.slug}`, 'onPress').props.onPress();
  });
  expect(mockScreens.mounts).toBe(opened + 1);
  // The chooser closes onto a fresh scroll view for the seat.
  const closed = mockScreens.mounts;
  await act(async () => {
    resolveView(c.yourMPFor(seat.electorate_id, index, manifest));
  });
  expect(
    r.root.findAll((n) => n.props.testID === 'your-seat-name').length,
  ).toBeGreaterThan(0);
  // Drawing the seat and its member's record keeps that scroll view.
  await act(async () => {});
  expect(mockScreens.mounts).toBe(closed);
  // Change seat opens the chooser in a fresh one, at its top.
  await act(async () => find('change-seat', 'onPress').props.onPress());
  expect(mockScreens.mounts).toBe(closed + 1);
  await act(async () => r.unmount());
});
