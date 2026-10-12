// Pass 5 lane B: "Use my location" sits below the field, so a seat is often
// confirmed from further down the chooser. The chosen seat reloads after the
// chooser closes; the page must land at its top once it has drawn, not keep
// the chooser's offset (device journeys 09 and 24, 12 Oct).
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { catalogs as runtime } from '../src/api/runtime';
import * as c from '../src/api/catalogs';
import { catalogs, index, manifest, people, roster, slugs } from './pinned';
import YourMP from '../src/features/YourMP';
import { loadChoice, saveChoice } from '../src/features/your-mp/choice-store';

const mockScroll = { scrollTo: jest.fn() };
jest.mock('../src/design/primitives', () => {
  const actual = jest.requireActual('../src/design/primitives');
  const React = jest.requireActual('react');
  return {
    ...actual,
    // The real screen's scroll view, as far as the chooser needs it.
    Screen: (p: { scrollRef?: { current: unknown }; children?: unknown }) => {
      if (p.scrollRef) p.scrollRef.current = mockScroll;
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

test('the chosen seat lands at its top once it has drawn, whatever the chooser offset', async () => {
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
  const find = (id: string, key: 'onPress' | 'onChangeText') =>
    r.root.find(
      (n) => n.props.testID === id && typeof n.props[key] === 'function',
    );
  await act(async () => {
    find('seat-search', 'onChangeText').props.onChangeText('Grayndler');
  });
  await act(async () => {
    find(`seat-choice-${seat.slug}`, 'onPress').props.onPress();
  });
  // The chooser closes onto a loading page: one scroll to the top.
  const closing = mockScroll.scrollTo.mock.calls.length;
  expect(closing).toBeGreaterThan(0);
  await act(async () => {
    resolveView(c.yourMPFor(seat.electorate_id, index, manifest));
  });
  // The drawn seat lands at its top again.
  expect(mockScroll.scrollTo.mock.calls.length).toBe(closing + 1);
  expect(mockScroll.scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ animated: false }),
  );
  // Later data (the member's profile) does not move the page again.
  await act(async () => {});
  expect(mockScroll.scrollTo.mock.calls.length).toBe(closing + 1);
  await act(async () => r.unmount());
});
