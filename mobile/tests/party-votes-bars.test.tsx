// A vote's party rows: every bar on one scale, and a bar that keeps its
// width when the row stacks at accessibility text sizes.
import { act } from 'react';
import { StyleSheet } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { useAccessibilitySize } from '../src/design/accessibility';
import { PartyVotes } from '../src/features/bills/parts';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useAccessibilitySize: jest.fn(() => false),
}));

const splits = [
  { party: 'ALP', label: 'Labor', ayes: 70, noes: 0 },
  { party: 'GRN', label: 'Greens', ayes: 11, noes: 0 },
];

async function tracks() {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <PartyVotes splits={splits} recorded testID="vote-parties" />,
    );
  });
  const found = view.root.findAll(
    (node) =>
      typeof node.type === 'string' && /-bar$/.test(node.props.testID ?? ''),
  );
  expect(found).toHaveLength(splits.length);
  const result = found.map((node) => ({
    track: StyleSheet.flatten(node.props.style),
    ayes: StyleSheet.flatten(
      (node.children[0] as TestRenderer.ReactTestInstance).props.style,
    ).width,
  }));
  await act(async () => view.unmount());
  return result;
}

test('bars in different groups share one scale', async () => {
  const [labor, greens] = await tracks();
  expect(labor!.ayes).toBe('100%');
  expect(greens!.ayes).toBe(`${(11 / 70) * 100}%`);
});

test('at accessibility sizes each bar takes the full line', async () => {
  jest.mocked(useAccessibilitySize).mockReturnValue(true);
  for (const { track } of await tracks()) expect(track.width).toBe('100%');
});

test('the notes on what the party rows rest on are drawn under them', async () => {
  let view!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    view = TestRenderer.create(
      <PartyVotes
        splits={splits}
        recorded
        notes={['2 not placed with a party']}
        testID="vote-parties"
      />,
    );
  });
  const notes = view.root.find(
    (node) =>
      typeof node.type === 'string' &&
      node.props.testID === 'vote-parties-notes',
  );
  expect(notes.props.children).toBe('2 not placed with a party.');
  await act(async () => view.unmount());
});
