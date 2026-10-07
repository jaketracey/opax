import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AskScreen from '../src/features/ask/AskScreen';
import { client } from '../src/api/runtime';
import { askSession } from '../src/features/ask/session';
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
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
  useAccount: () => ({ status: null }),
  accountSnapshot: () => ({ status: null }),
}));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: () => saved,
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
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
  return Object.fromEntries(
    [
      'Screen',
      'Button',
      'Field',
      'Group',
      'Heading',
      'FilterChip',
      'Text',
      'Section',
      'ErrorState',
      'EmptyState',
      'LoadingState',
    ].map((k) => [k, basic]),
  );
});
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  Options: () => null,
}));
test('Ask mount, typing, options and tab remount never call paid routes', async () => {
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
  await act(async () => {
    view!.unmount();
    askSession.start();
  });
});
