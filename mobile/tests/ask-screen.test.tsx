import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AskScreen from '../src/features/ask/AskScreen';
import clarify from '../scripts/fixtures/ask-clarify.json';
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
// These readers agreed to Ask's consent already (ask-consent.test.tsx).
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
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
    // The input and its send button, under their own test IDs.
    Composer: (p: Record<string, unknown> & { onSubmit: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(View, { ...p, onSubmit: undefined }),
        React.createElement(View, {
          testID: p.submitTestID,
          accessibilityLabel: p.submitLabel,
          onPress: p.onSubmit,
        }),
      ),
    // The real screen's scroll view, as far as the reveal needs it.
    KeyboardStableScreen: (p: { scrollRef?: { current: unknown } }) => {
      if (p.scrollRef) p.scrollRef.current = mockScroll;
      return basic(p);
    },
  };
});
// An answer's own rendering is covered elsewhere; here it only has to exist.
jest.mock('../src/features/ask/AnswerView', () => ({
  AnswerView: () => null,
}));
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
test('a follow-up with nothing to search on asks for a full question, with the suggestion one tap away', async () => {
  const answer = {
    answer: 'David Pocock’s proposals centre on surplus Commonwealth land.',
    citations: {},
    sources: [],
  };
  jest
    .mocked(client.askPost)
    .mockReset()
    .mockResolvedValueOnce(answer)
    .mockResolvedValueOnce(clarify)
    .mockResolvedValueOnce(answer);
  let view: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  const byId = (id: string) => view!.root.findAllByProps({ testID: id });
  await act(async () => {
    byId('ask-question')[0]!.props.onChangeText(
      'What has David Pocock proposed about housing affordability?',
    );
  });
  await act(async () => {
    await byId('ask-submit')[0]!.props.onPress();
  });
  await act(async () => {
    byId('ask-followup-field')[0]!.props.onChangeText('High');
  });
  await act(async () => {
    await byId('ask-followup-submit')[0]!.props.onPress();
  });
  // Sent as a follow-up, with the conversation as context.
  expect(jest.mocked(client.askPost).mock.calls[1]?.[1]).toMatchObject({
    question: 'High',
    context: [
      {
        author: 'user',
        text: 'What has David Pocock proposed about housing affordability?',
      },
      { author: 'answer', text: answer.answer },
    ],
  });
  const turn = byId('ask-turn')[0]!;
  expect(
    turn.findAllByProps({ testID: 'ask-clarify-question' })[0]!.props.children,
  ).toBe('High');
  expect(
    turn.findAllByProps({ testID: 'ask-clarify-message' })[0]!.props.message,
  ).toBe('That’s too short to search the record on. Did you mean:');
  const suggestion = turn.findAllByProps({
    testID: 'ask-clarify-suggestion',
  })[0]!;
  expect(suggestion.props.title).toBe(clarify.suggested_question);
  // No answer, no "Understood as", and the earlier answer's follow-up box stays.
  expect(byId('ask-understood')).toEqual([]);
  expect(byId('ask-user-question').map((n) => n.props.children)).not.toContain(
    'High',
  );
  expect(byId('ask-followup-field')).not.toEqual([]);
  expect(askSession.snapshot().thread).toHaveLength(2);
  await act(async () => {
    await suggestion.props.onPress();
  });
  const asked = jest.mocked(client.askPost).mock.calls[2]?.[1] as {
    question: string;
    context: { text: string }[];
  };
  expect(asked.question).toBe(clarify.suggested_question);
  expect(asked.context.map((c) => c.text)).not.toContain('High');
  expect(byId('ask-clarify')).toEqual([]);
  expect(askSession.snapshot().thread).toHaveLength(4);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
    view!.unmount();
    askSession.start();
  });
});

test('a failed follow-up hides the previous answer suggestions and keeps Try again', async () => {
  jest
    .mocked(client.askPost)
    .mockReset()
    .mockResolvedValueOnce({
      answer: 'Synthetic fixture answer.',
      citations: {},
      sources: [
        {
          resource: 'fixture',
          title: 'Synthetic fixture',
          slug: 'fixture',
          snippet: 'Synthetic evidence passage.',
        },
      ],
    })
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    })
    .mockRejectedValueOnce(
      new AskFailure('rate-limited', 'Try again shortly.'),
    );
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  const byId = (id: string) => view.root.findAllByProps({ testID: id });
  await act(async () => {
    byId('ask-question')[0]!.props.onChangeText('A fixture question?');
  });
  await act(async () => {
    await byId('ask-submit')[0]!.props.onPress();
  });
  expect(byId('ask-followup-0')).not.toEqual([]);
  await act(async () => {
    byId('ask-followup-field')[0]!.props.onChangeText(
      'A failing fixture question?',
    );
  });
  await act(async () => {
    await byId('ask-followup-submit')[0]!.props.onPress();
  });
  expect(byId('ask-followups')).toEqual([]);
  expect(byId('ask-followup-0')).toEqual([]);
  expect(byId('ask-retry')).not.toEqual([]);
  expect(askSession.snapshot().thread).toHaveLength(2);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
    view.unmount();
    askSession.start();
  });
});

// Design pass 3D (concept board 5): one composer. At idle it leads the page
// with Options and Your conversations; once there is an answer the question
// and answer lead, and the same composer follows them as the follow-up.
test('one composer: the question at idle, the follow-up under an answer', async () => {
  jest
    .mocked(client.askPost)
    .mockReset()
    .mockResolvedValueOnce({
      answer: 'Synthetic fixture answer.',
      citations: {},
      sources: [
        {
          resource: 'fixture',
          title: 'Synthetic fixture',
          slug: 'fixture',
          snippet: 'Synthetic evidence passage.',
        },
      ],
    })
    .mockResolvedValueOnce({
      questions: [{ question: 'A grounded fixture follow-up?' }],
    });
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<AskScreen />);
  });
  const composers = () =>
    view.root
      .findAll(
        (n) =>
          typeof n.type === 'function' &&
          (n.type as { name?: string }).name === 'Composer',
      )
      .map((n) => n.props.testID);
  const byId = (id: string) => view.root.findAllByProps({ testID: id });
  expect(composers()).toEqual(['ask-question']);
  expect(byId('ask-options')).not.toEqual([]);
  expect(byId('ask-saved')).not.toEqual([]);
  await act(async () => {
    byId('ask-question')[0]!.props.onChangeText('A fixture question?');
  });
  await act(async () => {
    await byId('ask-submit')[0]!.props.onPress();
  });
  expect(composers()).toEqual(['ask-followup-field']);
  // The conversation's rows and "Start a new conversation" are under ⋯ now.
  expect(byId('ask-options')).toEqual([]);
  expect(byId('ask-saved')).toEqual([]);
  expect(byId('ask-new')).toEqual([]);
  expect(byId('ask-followup-0')).not.toEqual([]);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
    view.unmount();
    askSession.start();
  });
});
