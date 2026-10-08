import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect as mockUseEffect } from 'react';
import { router } from 'expo-router';
import native from '../modules/opax-voice';
import { CommunityScreen } from '../src/features/community/CommunityScreen';
import { clearCommunity } from '../src/features/community/session';
let mockParams: Record<string, string> = { view: 'home' };
let mockFocused = false;
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) =>
    mockUseEffect(
      () => (mockFocused ? callback() : undefined),
      [callback, mockFocused],
    ),
}));
jest.mock('../modules/opax-voice', () => ({
  __esModule: true,
  default: { communityRequest: jest.fn() },
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: true } }),
}));
jest.mock('../src/design/primitives', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const basic = (p: Record<string, unknown>) =>
    React.createElement(View, p, p.children);
  return {
    ...Object.fromEntries(
      [
        'Button',
        'ChoiceChips',
        'Disclosure',
        'EmptyState',
        'ErrorState',
        'Field',
        'Group',
        'Heading',
        'Icon',
        'IconButton',
        'KeyValueList',
        'LinkRow',
        'LoadingState',
        'Portrait',
        'RowList',
        'KeyboardStableScreen',
        'Section',
        'SegmentedControl',
        'StepButtons',
        'Text',
      ].map((k) => [k, basic]),
    ),
    Composer: (p: Record<string, unknown>) =>
      React.createElement(
        View,
        null,
        React.createElement(View, { ...p, onSubmit: undefined }),
        React.createElement(View, {
          testID: p.submitTestID,
          onPress: p.onSubmit,
        }),
      ),
  };
});
const request = jest.mocked(native!.communityRequest);
const reply = (v: unknown) => ({
  ok: true,
  value: { status: 200, body: JSON.stringify(v) },
});
let screen: ReactTestRenderer;
beforeEach(() => {
  clearCommunity();
  request.mockReset();
  mockParams = { view: 'home' };
  mockFocused = false;
  jest.mocked(router.push).mockClear();
});
afterEach(() => {
  if (screen) act(() => screen.unmount());
});
const press = async (id: string) =>
  act(async () => {
    screen.root
      .findAll(
        (n) => n.props.testID === id && typeof n.props.onPress === 'function',
      )[0]!
      .props.onPress();
  });
it('does not read on an unfocused mount or redraw, and reads one time when explicitly opened', async () => {
  request.mockResolvedValue(reply({ threads: [], more: false }));
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  expect(request).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  expect(request).toHaveBeenCalledTimes(1);
  mockFocused = false;
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  mockFocused = true;
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  expect(request).toHaveBeenCalledTimes(1);
});
it('searches only on explicit submit, and ignores an unchanged trimmed query', async () => {
  mockFocused = true;
  request.mockResolvedValue(reply({ threads: [], more: false }));
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  const input = () =>
    screen.root.findAll(
      (n) =>
        n.props.testID === 'community-search' &&
        typeof n.props.onChangeText === 'function',
    )[0]!;
  for (const q of ['b', 'bi', 'bill', ' bill ']) {
    await act(async () => input().props.onChangeText(q));
  }
  expect(request).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  await act(async () => input().props.onSubmitEditing());
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { view: 'home', feed: 'all', q: 'bill' },
    }),
  );
  mockParams = { view: 'home', feed: 'all', q: 'bill' };
  await act(async () => screen.update(<CommunityScreen />));
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1]![0]).toContain('q=bill');
  await act(async () => input().props.onChangeText(' bill '));
  await act(async () => input().props.onSubmitEditing());
  await press('community-search-submit');
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledTimes(2);
});
it('gates the first reply on guidelines with no write, and clears drafts across account changes', async () => {
  mockFocused = true;
  mockParams = { view: 'thread', id: 'discussion-a' };
  request.mockResolvedValue(
    reply({
      thread: {
        id: 'discussion-a',
        member_id: 'reader-a',
        title: 'Discussion title',
        body: 'Discussion body',
        display_name: 'Fixture Member',
        replies: 0,
        likes: 0,
      },
      replies: [],
    }),
  );
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  await act(async () => {
    screen.root
      .findAll(
        (n) =>
          n.props.testID === 'community-compose' &&
          typeof n.props.onChangeText === 'function',
      )[0]!
      .props.onChangeText('Private unfinished reply');
  });
  await press('community-send');
  expect(request).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({ params: { view: 'guidelines' } }),
  );
  mockFocused = false;
  await act(async () => {
    screen.update(<CommunityScreen />);
    clearCommunity();
  });
  expect(request).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  expect(
    screen.root.findAll(
      (n) =>
        n.props.testID === 'community-compose' &&
        typeof n.props.onChangeText === 'function',
    )[0]!.props.value,
  ).toBe('');
});

it('clears a draft when a deep link reuses the dynamic route for another discussion', async () => {
  mockFocused = true;
  mockParams = { view: 'thread', id: 'discussion-a' };
  request.mockResolvedValue(
    reply({
      thread: {
        id: 'discussion-a',
        member_id: 'reader-a',
        title: 'Discussion title',
        body: 'Discussion body',
        display_name: 'Fixture Member',
        replies: 0,
        likes: 0,
      },
      replies: [],
    }),
  );
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  await act(async () => {
    screen.root
      .findAll(
        (n) =>
          n.props.testID === 'community-compose' &&
          typeof n.props.onChangeText === 'function',
      )[0]!
      .props.onChangeText('Draft for discussion A');
  });
  mockParams = { view: 'thread', id: 'discussion-b' };
  await act(async () => {
    screen.update(<CommunityScreen />);
  });
  expect(
    screen.root.findAll(
      (n) =>
        n.props.testID === 'community-compose' &&
        typeof n.props.onChangeText === 'function',
    )[0]!.props.value,
  ).toBe('');
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every((call) => call[1] === 'GET')).toBe(true);
});
