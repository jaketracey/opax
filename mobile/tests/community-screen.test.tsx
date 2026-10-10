import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useEffect as mockUseEffect } from 'react';
import { router } from 'expo-router';
import native from '../modules/opax-voice';
import { CommunityScreen } from '../src/features/community/CommunityScreen';
import { clearCommunity } from '../src/features/community/session';
import { Platform } from 'react-native';
let mockParams: Record<string, string> = { view: 'home' };
let mockFocused = false;
let mockSignedIn = true;
let mockOptions: Record<string, unknown> = {};
jest.mock('expo-router', () => ({
  Stack: {
    Screen: (p: { options: Record<string, unknown> }) => {
      mockOptions = p.options;
      return null;
    },
  },
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
  useAccount: () => ({ status: { signedIn: mockSignedIn } }),
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
        'PadGrid',
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
        'Screen',
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
  mockSignedIn = true;
  mockOptions = {};
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
it('Android Community exposes its web boundary without native reads or missing sign-in routes', async () => {
  const original = Platform.OS;
  Object.defineProperty(Platform, 'OS', {
    value: 'android',
    configurable: true,
  });
  try {
    mockFocused = true;
    mockParams = { view: 'messages' };
    await act(async () => {
      screen = create(<CommunityScreen />);
    });
    expect(request).not.toHaveBeenCalled();
    expect(
      screen.root.findAll((n) => n.props.testID === 'community-open-web')
        .length,
    ).toBeGreaterThan(0);
    expect(
      screen.root.findAll((n) => n.props.testID === 'community-sign-in'),
    ).toHaveLength(0);
    expect(router.push).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(Platform, 'OS', {
      value: original,
      configurable: true,
    });
  }
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
  await act(async () => input().props.onSubmitEditing());
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

const ids = () =>
  new Set(
    screen.root
      .findAll((n) => typeof n.props.testID === 'string')
      .map((n) => n.props.testID as string),
  );
it('signed out, the home shows Latest only and one sign-in prompt for the member pages', async () => {
  mockFocused = true;
  mockSignedIn = false;
  request.mockResolvedValue(reply({ threads: [], more: false }));
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  const shown = ids();
  expect(shown.has('community-feeds')).toBe(false);
  expect(shown.has('community-new')).toBe(false);
  for (const view of [
    'members',
    'messages',
    'activity',
    'lists',
    'profile',
    'settings',
  ])
    expect(shown.has(`community-open-${view}`)).toBe(false);
  expect(
    screen.root.findAll(
      (n) =>
        n.props.testID === 'community-sign-in' && n.props.variant === 'primary',
      { deep: false },
    ),
  ).toHaveLength(1);
  expect(shown.has('community-open-guidelines')).toBe(true);
  // Refresh is a pull, not a drawn button.
  expect(shown.has('community-refresh')).toBe(false);
  expect(mockOptions).toEqual({ title: 'Community' });
});
it('signed in, the home keeps the feeds, Start a discussion and the member pages', async () => {
  mockFocused = true;
  request.mockResolvedValue(reply({ threads: [], more: false }));
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  const shown = ids();
  expect(shown.has('community-feeds')).toBe(true);
  expect(shown.has('community-new')).toBe(true);
  expect(shown.has('community-open-members')).toBe(true);
  expect(shown.has('community-sign-in')).toBe(false);
});
it('a discussion is titled once, by its heading; a reply is reported from its byline', async () => {
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
        replies: 1,
        likes: 0,
      },
      replies: [
        {
          id: 'reply-a',
          member_id: 'reader-b',
          body: 'Reply body',
          display_name: 'Other Fixture',
        },
      ],
    }),
  );
  await act(async () => {
    screen = create(<CommunityScreen />);
  });
  expect(mockOptions).toEqual({ title: 'Discussion', headerTitle: '' });
  const flag = screen.root.findAll(
    (n) => n.props.testID === 'community-report-reply-reply-a',
  )[0]!;
  expect(flag.props.symbol).toBe('flag');
  expect(flag.props.accessibilityLabel).toBe('Report reply from Other Fixture');
  await press('community-report-reply-reply-a');
  expect(router.push).toHaveBeenCalledWith(
    expect.objectContaining({
      params: { view: 'report', id: 'reply-a', kind: 'content' },
    }),
  );
});
