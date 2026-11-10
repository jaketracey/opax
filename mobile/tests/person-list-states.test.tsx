import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { ContentUnavailable } from '../src/design/states';
import { loadProfile, type Loaded } from '../src/features/Person';
import {
  PersonInterests,
  PersonVotes,
} from '../src/features/people/PersonLists';

jest.mock('../src/features/Person', () => ({ loadProfile: jest.fn() }));
jest.mock('expo-router', () => ({
  useSegments: () => [],
  useLocalSearchParams: () => ({ slug: 'fixture-member' }),
}));

const loaded = (status: string, partial = false) =>
  ({
    profile: {
      blocks: {
        votes: { status, data: null, partial },
        interests: { status, data: null, partial },
      },
    },
  }) as Loaded;

const pages = [
  ['votes', PersonVotes, 'No voting summary is held for this person'],
  [
    'declared interests',
    PersonInterests,
    'No register file is held for this person',
  ],
] as const;

test.each(pages)(
  '%s: a failed block offers retry without claiming an empty record',
  async (_kind, Page) => {
    jest.mocked(loadProfile).mockReset().mockResolvedValue(loaded('error'));
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(<Page />);
    });
    const error = view.root.findByType(ContentUnavailable);
    expect(error.props.title).toMatch(/Couldn’t load/);
    expect(error.props.action.label).toBe('Try again');
    jest.mocked(loadProfile).mockResolvedValue(loaded('missing'));
    await act(async () => error.props.action.onPress());
    expect(loadProfile).toHaveBeenCalledTimes(2);
    expect(view.root.findByType(ContentUnavailable).props.title).not.toMatch(
      /Couldn’t load/,
    );
    await act(async () => view.unmount());
  },
);

test.each(pages)(
  '%s: missing data describes coverage rather than declaring no records',
  async (_kind, Page, title) => {
    jest.mocked(loadProfile).mockResolvedValue(loaded('missing'));
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(<Page />);
    });
    expect(view.root.findByType(ContentUnavailable).props.title).toBe(title);
    await act(async () => view.unmount());
  },
);

test.each(pages)(
  '%s: an unreadable partial catalogue is explained and can be retried',
  async (_kind, Page) => {
    jest.mocked(loadProfile).mockResolvedValue(loaded('missing', true));
    let view!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      view = TestRenderer.create(<Page />);
    });
    const state = view.root.findByType(ContentUnavailable);
    expect(state.props.body).toBe('Some records could not be read.');
    expect(state.props.action.label).toBe('Try again');
    await act(async () => view.unmount());
  },
);
