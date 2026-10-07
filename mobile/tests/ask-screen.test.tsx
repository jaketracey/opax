import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AskScreen from '../src/features/ask/AskScreen';
import { client } from '../src/api/runtime';
import { askSession } from '../src/features/ask/session';
import { reconcileChats, pushChat } from '../src/features/ask/sync';
import { useLocalSearchParams } from 'expo-router';
import { chatsSnapshot } from '../src/features/ask/store';
import { AskFailure, type StreamHandlers } from '../src/features/ask/stream';
const mockScroll = { scrollTo: jest.fn() };
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn() },
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
    bills: jest.fn(),
  },
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: true } }),
  accountSnapshot: () => ({ status: { signedIn: true } }),
}));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => saved),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: jest.requireActual('../src/features/ask/sync').ChatSyncError,
  pushChat: jest.fn(),
  deleteRemoteChat: jest.fn(),
  reconcileChats: jest.fn(),
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
        'Screen',
        'Button',
        'Icon',
        'IconButton',
        'Field',
        'Group',
        'Heading',
        'FilterChip',
        'Text',
        'Section',
        'LinkRow',
        'RowList',
        'Disclosure',
        'ErrorState',
        'EmptyState',
        'LoadingState',
      ].map((k) => [k, basic]),
    ),
    // The real screen's scroll view, as far as the reveal needs it.
    KeyboardStableScreen: (p: { scrollRef?: { current: unknown } }) => {
      if (p.scrollRef) p.scrollRef.current = mockScroll;
      return basic(p);
    },
  };
});
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  Options: () => null,
}));
test('a scoped cold-start draft takes precedence over the previous saved conversation', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({
    entry: 'scoped-entry',
    question: 'What has Anthony Albanese said in parliament?',
    speaker: 'Anthony Albanese',
    kind: 'speech',
  });
  jest.mocked(chatsSnapshot).mockReturnValue({
    v: 1,
    active: 'previous-chat',
    chats: [
      {
        id: 'previous-chat',
        title: 'Previous question',
        kind: 'all',
        speaker: '',
        created: 1,
        updated: 1,
        thread: [{ role: 'answer', text: 'A previous saved answer.' }],
      },
    ],
  });
  let view: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  expect(
    view!.root.findAllByProps({ testID: 'ask-question' })[0]!.props.value,
  ).toBe('What has Anthony Albanese said in parliament?');
  expect(askSession.snapshot().options).toMatchObject({
    speaker: 'Anthony Albanese',
    kind: 'speech',
  });
  expect(askSession.snapshot().thread).toEqual([]);
  expect(client.askPost).not.toHaveBeenCalled();
  await act(async () => {
    view!.unmount();
    askSession.start();
  });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  jest.mocked(chatsSnapshot).mockReturnValue({ v: 1, active: null, chats: [] });
});
test('signed-in Ask mount, typing, options and tab remount never call paid routes', async () => {
  let view: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  expect(client.askPost).not.toHaveBeenCalled();
  await act(async () => {
    view!.root
      .findAllByProps({ testID: 'ask-question' })[0]!
      .props.onChangeText('A question');
  });
  expect(client.askPost).not.toHaveBeenCalled();
  await act(async () => {
    view!.root.findAllByProps({ testID: 'ask-options' })[0]!.props.onPress();
  });
  expect(client.askPost).not.toHaveBeenCalled();
  await act(async () => {
    view!.unmount();
    view = create(<AskScreen />);
  });
  expect(client.askPost).not.toHaveBeenCalled();
  expect(reconcileChats).not.toHaveBeenCalled();
  expect(pushChat).not.toHaveBeenCalled();
  await act(async () => {
    view!.unmount();
    askSession.start();
  });
});
test('failed account sync preserves local history without claiming an account save', async () => {
  jest.mocked(reconcileChats).mockRejectedValueOnce(new Error('Unavailable'));
  let view: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  await act(async () => {
    await view!.root
      .findAllByProps({ testID: 'ask-saved' })[0]!
      .props.onPress();
  });
  const rendered = view!.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children);
  expect(rendered).toContain('Saved on this iPhone.');
  expect(rendered).not.toContain('Saved to your account and on this iPhone.');
  expect(reconcileChats).toHaveBeenCalledTimes(1);
  expect(client.askPost).not.toHaveBeenCalled();
  expect(pushChat).not.toHaveBeenCalled();
  await act(async () => {
    view!.unmount();
    askSession.start();
  });
});
test('a submitted question shows its live stages with Cancel and is revealed below the header', async () => {
  let on: StreamHandlers | undefined,
    fail: (e: unknown) => void = () => {};
  jest.mocked(client.askPost).mockImplementationOnce(
    (_path, _body, _signal, handlers) =>
      new Promise((_resolve, reject) => {
        on = handlers;
        fail = reject;
      }),
  );
  let view: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  const byId = (id: string) => view!.root.findAllByProps({ testID: id });
  await act(async () => {
    byId('ask-question')[0]!.props.onChangeText('Who spoke on housing?');
  });
  mockScroll.scrollTo.mockClear();
  await act(async () => {
    byId('ask-submit')[0]!.props.onPress();
  });
  const turn = byId('ask-turn')[0]!;
  // The question as asked, then the stages, with Cancel inside the same block.
  expect(turn.findAllByProps({ testID: 'ask-user-question' })).not.toEqual([]);
  const progress = turn.findAllByProps({ testID: 'ask-progress' })[0]!;
  expect(progress.findAllByProps({ testID: 'ask-stages' })).not.toEqual([]);
  expect(progress.findAllByProps({ testID: 'ask-cancel' })).not.toEqual([]);
  expect(byId('ask-stage-0-active')).not.toEqual([]);
  // The reveal uses the turn's own layout and clears the native header
  // (no navigator here: 44pt), never the raw content y behind the bar.
  await act(async () => {
    turn.props.onLayout({ nativeEvent: { layout: { y: 400 } } });
  });
  expect(mockScroll.scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ y: 400 - 44 - 12 }),
  );
  await act(async () => {
    on!.stage('Searching the record');
  });
  expect(byId('ask-stage-0')).not.toEqual([]);
  expect(byId('ask-stage-1-active')).not.toEqual([]);
  // An error after the stages keeps the question, calmly, with a retry.
  mockScroll.scrollTo.mockClear();
  await act(async () => {
    fail(new AskFailure('partial', 'The answer stream failed.'));
  });
  const failed = byId('ask-turn')[0]!;
  expect(
    failed.findAllByProps({ testID: 'ask-failed-question' })[0]!.props.children,
  ).toBe('Who spoke on housing?');
  expect(failed.findAllByProps({ testID: 'ask-error-partial' })).not.toEqual(
    [],
  );
  expect(failed.findAllByProps({ testID: 'ask-retry' })).not.toEqual([]);
  expect(byId('ask-progress')).toEqual([]);
  await act(async () => {
    failed.props.onLayout({ nativeEvent: { layout: { y: 0 } } });
  });
  // Near the top it settles at rest, under the header, not past it.
  expect(mockScroll.scrollTo).toHaveBeenLastCalledWith(
    expect.objectContaining({ y: -44 }),
  );
  await act(async () => {
    // Let the reveal's fallback frames run before teardown.
    await new Promise((r) => setTimeout(r, 50));
    view!.unmount();
    askSession.start();
  });
});
