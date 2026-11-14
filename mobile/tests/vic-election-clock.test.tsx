import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { useElectionNow } from '../src/features/vic-election/clock';
import { electionCopy } from '../src/features/vic-election/model';
import { VIC_ELECTION_INSTANTS } from '../src/features/vic-election/state';

let mockNow = new Date();
jest.mock('../src/features/today/Masthead', () => ({ useNow: () => mockNow }));
jest.mock('../src/features/today/launch-fixture', () => ({
  vicElectionFixtureNow: () => null,
  subscribeElectionClock: () => () => {},
  electionClockSnapshot: () => null,
}));
function Clock({
  apiState,
}: {
  apiState?: 'pre_poll' | 'early_voting' | 'election_day';
}) {
  const now = useElectionNow(VIC_ELECTION_INSTANTS);
  const copy = electionCopy({ state: apiState }, now);
  return <Text>{copy.body}</Text>;
}
test.each([
  [
    '2026-11-17T22:00:00Z',
    'Early voting begins',
    'Early voting runs',
    'pre_poll',
  ],
  [
    '2026-11-27T07:00:00Z',
    'Early voting runs',
    'Early voting has closed',
    'early_voting',
  ],
  [
    '2026-11-27T13:00:00Z',
    'Early voting has closed',
    'Voting runs from 8 am to 6 pm AEDT.',
    'early_voting',
  ],
  [
    '2026-11-27T21:00:00Z',
    'Voting runs from 8 am to 6 pm AEDT.',
    'Voting is open until 6 pm AEDT.',
    'election_day',
  ],
  [
    '2026-11-28T07:00:00Z',
    'Voting is open',
    'The count is under way.',
    'election_day',
  ],
] as const)(
  'an open page updates exactly at %s with an ageing API state',
  (instant, before, after, apiState) => {
    mockNow = new Date(Date.parse(instant) - 60000);
    jest.useFakeTimers({ now: mockNow });
    let tree!: TestRenderer.ReactTestRenderer;
    try {
      act(() => {
        tree = TestRenderer.create(<Clock apiState={apiState} />);
      });
      const text = () => tree.root.findByType(Text).props.children as string;
      expect(text()).toContain(before);
      act(() => jest.advanceTimersByTime(59999));
      expect(text()).toContain(before);
      act(() => jest.advanceTimersByTime(1));
      expect(text()).toContain(after);
      expect(text()).not.toContain(before);
    } finally {
      act(() => tree?.unmount());
      jest.useRealTimers();
    }
  },
);
