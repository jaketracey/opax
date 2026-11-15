import { withNavigationOptions } from './navigation-options';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router, useLocalSearchParams } from 'expo-router';
import {
  AccessibilityInfo,
  Dimensions,
  InteractionManager,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import AskScreen from '../src/features/ask/AskScreen';
import { AskDock } from '../src/features/ask/AskDock';
import { AskColumns } from '../src/features/ask/AskLayout';
import { billScopeCopy } from '../src/features/ask/AskBillScope';
import { client } from '../src/api/runtime';
import {
  billKeyPattern,
  chips,
  clearChip,
  decodeChat,
  decodeOptions,
  defaultOptions,
  requestBody,
  titleFor,
} from '../src/features/ask/model';
import { useOpenBillAsk } from '../src/features/ask/open';
import { askReturnSnapshot, setAskReturn } from '../src/features/ask/return';
import {
  arriveInBillAsk,
  askSession,
  billAskCopy,
} from '../src/features/ask/session';
import { chatsSnapshot, saveChats } from '../src/features/ask/store';
import { askTabPath } from '../src/navigation/routes/ask';
import { takeFocusRequest } from '../src/design/keyboard';
import { Text } from '../src/design/text';
import {
  resetAdaptiveDeviceForTests,
  setWindowTraitsOverride,
} from '../src/design/adaptive';
import { registerFilterModel } from '../src/features/sheets/filter-model';

/**
 * "Ask about this bill" (Jake, build 76): Ask opens scoped to that bill. No
 * conversation list, no Try asking, an empty focused composer that reads
 * "Ask about this bill", the bill's chip with an × that returns to normal
 * Ask, a way back that reads "Bill", the bill's key on every request, and a
 * saved title that opens with the bill's short title.
 */
const mockBar: { options: Record<string, unknown> } = { options: {} };
const mockSegments: { current: string[] } = {
  current: ['(tabs)', '(bills)', 'bill'],
};
jest.mock('../src/analytics/timing', () => ({ useScreenReady: jest.fn() }));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockBar.options = options;
      return null;
    },
  },
  useLocalSearchParams: jest.fn(() => ({})),
  useSegments: () => mockSegments.current,
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual('react').useEffect(effect, [effect]),
  router: {
    push: jest.fn(),
    navigate: jest.fn(),
    dismissTo: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  },
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: {
    roster: jest.fn().mockRejectedValue(new Error('Offline')),
    slugs: jest.fn(),
    bills: jest.fn(),
  },
}));
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: { signedIn: true }, checking: false }),
  accountSnapshot: () => ({ status: { signedIn: true }, checking: false }),
}));
jest.mock('../src/voice/linked', () => ({ voiceLinked: false }));
jest.mock('../src/features/ask/store', () => {
  const saved = { v: 1, active: null, chats: [] };
  return {
    chatsSnapshot: jest.fn(() => saved),
    subscribeChats: () => () => {},
    subscribeChatDeletion: () => () => {},
    loadChats: jest.fn().mockResolvedValue(undefined),
    saveChats: jest.fn().mockResolvedValue(undefined),
    forgetActiveChat: jest.fn(),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: jest.fn(() => ({ status: 'none' })),
  useSavedChoice: jest.fn(() => null),
  savedSeatDirectory: jest.fn(() => null),
}));
jest.mock('../src/features/ask/AnswerView', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    AnswerView: () => React.createElement(View, { testID: 'ask-answer' }),
    SearchOpaxRow: () => null,
    AskRevealContext: React.createContext(null),
    announceAnswer: jest.fn(),
    machineNote: { title: 'Machine-written', body: ['Fixture note.'] },
  };
});
jest.mock('../src/features/sheets/filter-model', () => ({
  ...jest.requireActual('../src/features/sheets/filter-model'),
  registerFilterModel: jest.fn(),
}));

const bill = {
  key: 'au-federal-s9999',
  name: 'Example Amendment (Placeholder Measures and Other Matters) Bill 2026',
};
const oneChat = {
  v: 1 as const,
  active: null,
  chats: [
    {
      id: 'saved-fixture',
      title: 'A saved fixture question?',
      kind: 'all' as const,
      speaker: '',
      created: 1,
      updated: 1,
      thread: [
        { role: 'user' as const, text: 'A saved fixture question?' },
        { role: 'answer' as const, text: 'A saved fixture answer.' },
      ],
    },
  ],
};
const noChats = { v: 1 as const, active: null, chats: [] };
const answer = {
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
};
// The Worker echoes the bill it kept a scoped answer to.
const billAnswer = { ...answer, scope: { bill: 'au-federal-s9999' } };

let view: ReactTestRenderer | null = null;
const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
beforeEach(() => {
  takeFocusRequest('ask');
  jest.mocked(client.askPost).mockReset();
  jest.mocked(router.navigate).mockClear();
  jest.mocked(saveChats).mockClear();
  jest.mocked(chatsSnapshot).mockImplementation(() => oneChat);
  mockSegments.current = ['(tabs)', '(bills)', 'bill'];
  askSession.start();
  askSession.setDraft('');
});
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
    view?.unmount();
  });
  view = null;
  Object.defineProperty(Platform, 'OS', os);
  askSession.start();
  askSession.setDraft('');
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  setAskReturn(null);
  jest.restoreAllMocks();
});
async function mount() {
  await act(async () => {
    view = create(
      withNavigationOptions(<AskScreen />, (options) => {
        mockBar.options = options;
      }),
    );
  });
  return view!;
}
const hosts = (id: string) =>
  view!.root.findAll(
    (n) => typeof n.type === 'string' && n.props.testID === id,
  );
const byId = (id: string) => view!.root.findAllByProps({ testID: id });
const one = (id: string) =>
  view!.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
const textIn = (id: string) =>
  byId(id)
    .flatMap((n) => n.findAllByType(Text))
    .map((n) => n.props.children)
    .find((c) => typeof c === 'string');
/** Taps a bill's Ask button from the bill's page, as the app does. */
async function tapAsk(from = bill, options?: { open: boolean }) {
  let open!: ReturnType<typeof useOpenBillAsk>;
  function Entry() {
    open = useOpenBillAsk();
    return null;
  }
  let entry!: ReactTestRenderer;
  await act(async () => {
    entry = create(<Entry />);
  });
  await act(async () => open(from, options));
  await act(async () => entry.unmount());
}
const scopedOptions = {
  ...defaultOptions,
  bill: bill.key,
  billName: bill.name,
};

describe('the request and the saved copy', () => {
  test('the bill’s key is sent; its title never is', () => {
    const body = requestBody('What does it change?', scopedOptions, []);
    expect(body).toEqual({
      question: 'What does it change?',
      kind: 'all',
      bill: bill.key,
    });
    expect(requestBody('A question?', defaultOptions, [])).not.toHaveProperty(
      'bill',
    );
  });

  test('a saved conversation keeps a real bill key and drops anything else', () => {
    expect(
      decodeOptions({ bill: bill.key, billName: bill.name }),
    ).toMatchObject({ bill: bill.key, billName: bill.name });
    for (const key of ['../etc', 'Bill 1', '', 7])
      expect(decodeOptions({ bill: key, billName: bill.name })).toMatchObject({
        bill: '',
        billName: '',
      });
  });

  test('a key is 2 to 120 characters, as the Worker takes it', () => {
    expect(billKeyPattern.test('a')).toBe(false);
    expect(billKeyPattern.test('ab')).toBe(true);
    expect(billKeyPattern.test(`a${'b'.repeat(119)}`)).toBe(true);
    expect(billKeyPattern.test(`a${'b'.repeat(120)}`)).toBe(false);
  });

  test('a copy restored from the account, which carries no options, is still the bill’s conversation', () => {
    const restored = decodeChat({
      id: 'restored-fixture',
      title: `${bill.name}: What does it change?`,
      kind: 'all',
      created: 1,
      updated: 2,
      thread: [
        { role: 'user', text: 'What does it change?' },
        {
          role: 'answer',
          text: 'A fixture answer.',
          sources: [],
          scope: { bill: bill.key },
        },
      ],
    })!;
    expect(restored.options).toMatchObject({
      bill: bill.key,
      billName: bill.name,
    });
    expect(restored.thread[0]!.options).toMatchObject({ bill: bill.key });
    expect(titleFor(restored.thread)).toBe(restored.title);
    // An ordinary restored conversation gains nothing.
    const plain = decodeChat({
      id: 'restored-plain',
      title: 'What does it change?',
      kind: 'all',
      created: 1,
      updated: 2,
      thread: [
        { role: 'user', text: 'What does it change?' },
        { role: 'answer', text: 'A fixture answer.', sources: [] },
      ],
    })!;
    expect(plain.options).toMatchObject({ bill: '', billName: '' });
  });

  test('the chip names the bill, and clearing it clears both fields', () => {
    expect(chips(scopedOptions)).toEqual([
      { id: 'bill', key: 'Bill', value: bill.name },
    ]);
    expect(clearChip({ ...scopedOptions, topic: 'housing' }, 'bill')).toEqual({
      ...defaultOptions,
      topic: 'housing',
    });
  });

  test('the title is the bill’s short title, then the question', () => {
    expect(
      titleFor([
        { role: 'user', text: 'What does it  change?', options: scopedOptions },
      ]),
    ).toBe(`${bill.name}: What does it change?`);
    // Any other conversation keeps its question alone.
    expect(titleFor([{ role: 'user', text: 'What does it change?' }])).toBe(
      'What does it change?',
    );
    const long = titleFor([
      {
        role: 'user',
        text: 'A question?',
        options: { ...scopedOptions, billName: 'A'.repeat(200) },
      },
    ]);
    expect(long).toBe(`${'A'.repeat(69)}…: A question?`);
  });
});

describe('arriving from a bill', () => {
  test('the tap scopes Ask to the bill with an empty composer, the keyboard asked for, and "Bill" as the way back', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions')
      .mockImplementation(() => undefined);
    askSession.setDraft('Words left in the composer');
    // The iPad pane beside the list: the route names the list, not a bill.
    mockSegments.current = ['(tabs)', '(bills)'];
    await tapAsk(bill, { open: true });
    expect(askSession.snapshot().draft).toBe('');
    expect(askSession.composerOptions()).toEqual(scopedOptions);
    expect(takeFocusRequest('ask')).toBe(true);
    expect(announce).toHaveBeenCalledWith(billAskCopy.arrived, { queue: true });
    expect(askReturnSnapshot()).toEqual({
      tab: '(bills)',
      name: bill.name,
      short: 'Bill',
    });
    expect(router.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: askTabPath,
        params: expect.objectContaining({
          question: '',
          bill: bill.key,
          billName: bill.name,
        }),
      }),
    );
    expect(client.askPost).not.toHaveBeenCalled();
  });

  test.each([
    ['the bill’s page', ['(tabs)', '(today)', 'bill'], '(today)', 'Bill'],
    [
      'the bill’s text',
      ['(tabs)', '(search)', 'bill-text'],
      '(search)',
      'Bill',
    ],
    [
      'a row’s menu in the Bills list',
      ['(tabs)', '(bills)'],
      '(bills)',
      'Bills',
    ],
  ] as const)(
    'from %s the way back reads %s',
    async (_name, segments, tab, short) => {
      mockSegments.current = [...segments];
      await tapAsk();
      expect(askReturnSnapshot()).toEqual({ tab, name: bill.name, short });
      expect(askSession.composerOptions().bill).toBe(bill.key);
    },
  );

  test('idle shows no conversations and no starters; the composer reads "Ask about this bill"', async () => {
    await tapAsk();
    // The Ask screen mounts with the tap's own route params.
    const { params } = jest.mocked(router.navigate).mock.calls[0]![0] as {
      params: Record<string, string>;
    };
    (useLocalSearchParams as jest.Mock).mockReturnValue(params);
    await mount();
    expect(askSession.composerOptions().bill).toBe(bill.key);
    for (const id of [
      'ask-idle',
      'ask-idle-line',
      'ask-starters',
      'ask-conversations',
      'ask-see-all-conversations',
      'ask-starter-0',
      'ask-conversation-0',
    ])
      expect(byId(id)).toEqual([]);
    expect(hosts('ask-bill-idle')).toHaveLength(1);
    expect(textIn('ask-bill-idle-line')).toBe(billScopeCopy.line);
    expect(one('ask-question').props.value).toBe('');
    expect(textIn('ask-placeholder')).toBe('Ask about this bill');
    expect(one('ask-question').props.accessibilityHint).toBe(
      'Ask about this bill',
    );
  });

  test('the chip says the bill in full and its × returns to normal Ask', async () => {
    await tapAsk();
    await mount();
    const name = hosts('ask-bill-chip-name')[0]!;
    expect(name.props.accessible).toBe(true);
    expect(name.props.accessibilityLabel).toBe(`Bill, ${bill.name}`);
    const title = name.findByType(Text);
    expect(title.props.children).toBe(bill.name);
    // The title wraps at every text size: never one line, never capped.
    expect(title.props.numberOfLines).toBeUndefined();
    expect(title.props.maxFontSizeMultiplier).toBeUndefined();
    expect(title.props.wordSafe).toBe(true);
    expect(StyleSheet.flatten(name.props.style).flexShrink).toBe(1);
    const clear = one('ask-bill-chip-clear');
    expect(clear.props.accessibilityRole).toBe('button');
    expect(clear.props.accessibilityLabel).toBe(`Remove Bill, ${bill.name}`);
    const size = StyleSheet.flatten(
      hosts('ask-bill-chip-clear')[0]!.props.style,
    );
    expect(size.minWidth).toBeGreaterThanOrEqual(44);
    expect(size.minHeight).toBeGreaterThanOrEqual(44);
    // The sliders control counts the scope; the options line does not repeat it.
    expect(one('ask-composer-options').props.accessibilityLabel).toBe(
      'Options, 1 on',
    );
    expect(byId('ask-options-line')).toEqual([]);

    await act(async () => clear.props.onPress());
    expect(askSession.composerOptions()).toEqual(defaultOptions);
    expect(byId('ask-bill-chip')).toEqual([]);
    expect(byId('ask-bill-idle')).toEqual([]);
    expect(hosts('ask-idle')).toHaveLength(1);
    expect(hosts('ask-starters')).toHaveLength(1);
    expect(hosts('ask-conversations')).toHaveLength(1);
    expect(textIn('ask-placeholder')).toBe('Ask about the public record');
  });

  test('a question is sent with the bill’s key and saved under the bill’s title; follow-ups stay scoped', async () => {
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(billAnswer)
      .mockResolvedValueOnce({ questions: [] })
      .mockResolvedValueOnce(billAnswer)
      .mockResolvedValueOnce({ questions: [] });
    await tapAsk();
    await mount();
    await act(async () =>
      one('ask-question').props.onChangeText('What does it change?'),
    );
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    const asks = () =>
      jest
        .mocked(client.askPost)
        .mock.calls.filter(([path]) => path === '/api/ask?stream=1');
    expect(asks()[0]![1]).toEqual({
      question: 'What does it change?',
      kind: 'all',
      bill: bill.key,
    });
    const saved = jest.mocked(saveChats).mock.calls.at(-1)![0];
    expect(saved.chats[0]!.title).toBe(`${bill.name}: What does it change?`);
    expect(saved.chats[0]!.options).toMatchObject({ bill: bill.key });
    // The chip stays through the conversation.
    expect(hosts('ask-bill-chip')).toHaveLength(1);
    await act(async () => one('ask-question').props.onChangeText('And who?'));
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    expect(asks()[1]![1]).toMatchObject({
      question: 'And who?',
      bill: bill.key,
    });
  });

  test('the keyboard comes up as Ask opens', async () => {
    const focus = jest
      .spyOn(TextInput.prototype, 'focus')
      .mockImplementation(() => undefined);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((
      task: () => void,
    ) => {
      task();
      return { cancel: () => undefined };
    }) as never);
    jest.spyOn(global, 'requestAnimationFrame').mockImplementation((frame) => {
      frame(0);
      return 0;
    });
    await tapAsk();
    await mount();
    expect(focus).toHaveBeenCalled();
    expect(one('ask-question').props.value).toBe('');
  });

  test('a link that repeats a parameter opens Ask without the repeated value', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      entry: 'repeated-fixture-entry',
      question: ['a', 'b'],
      bill: bill.key,
      billName: ['a', 'b'],
    });
    await mount();
    expect(one('ask-question').props.value).toBe('');
    expect(askSession.composerOptions()).toMatchObject({
      bill: bill.key,
      billName: '',
    });
    expect(hosts('ask-bill-chip-name')[0]!.props.accessibilityLabel).toBe(
      'Bill, This bill',
    );
  });

  test('an answer the Worker did not keep to the bill drops the chip and the bill from the title', async () => {
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] })
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    await tapAsk();
    await mount();
    await act(async () =>
      one('ask-question').props.onChangeText('What does it change?'),
    );
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    // Nothing is blocked: the answer is there, without the bill's framing.
    expect(hosts('ask-answer')).toHaveLength(1);
    expect(byId('ask-bill-chip')).toEqual([]);
    expect(askSession.snapshot().options).toEqual(defaultOptions);
    expect(askSession.snapshot().thread.map((m) => m.options?.bill)).toEqual([
      '',
      '',
    ]);
    const saved = jest.mocked(saveChats).mock.calls.at(-1)![0];
    expect(saved.chats[0]!.title).toBe('What does it change?');
    await act(async () => one('ask-question').props.onChangeText('And who?'));
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    const second = jest
      .mocked(client.askPost)
      .mock.calls.filter(([path]) => path === '/api/ask?stream=1')[1]![1];
    expect(second).not.toHaveProperty('bill');
  });

  test('× in the middle of a conversation: later questions go to every record, and the title stays', async () => {
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(billAnswer)
      .mockResolvedValueOnce({ questions: [] })
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [] });
    await tapAsk();
    await mount();
    await act(async () =>
      one('ask-question').props.onChangeText('What does it change?'),
    );
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    await act(async () => one('ask-bill-chip-clear').props.onPress());
    expect(byId('ask-bill-chip')).toEqual([]);
    // The conversation stays open: this is not a return to the idle page.
    expect(askSession.snapshot().thread).toHaveLength(2);
    await act(async () => one('ask-question').props.onChangeText('And who?'));
    await act(async () => {
      await one('ask-submit').props.onPress();
    });
    const second = jest
      .mocked(client.askPost)
      .mock.calls.filter(([path]) => path === '/api/ask?stream=1')[1]![1];
    expect(second).toMatchObject({ question: 'And who?' });
    expect(second).not.toHaveProperty('bill');
    const saved = jest.mocked(saveChats).mock.calls.at(-1)![0];
    expect(saved.chats[0]!.title).toBe(`${bill.name}: What does it change?`);
  });

  test('× on a scope that waits for a running answer ends the arrival: the next send is a follow-up', async () => {
    let finish!: (value: unknown) => void;
    jest.mocked(client.askPost).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await mount();
    let running!: Promise<void>;
    await act(async () => {
      running = askSession.submit('A running fixture question?');
    });
    await act(async () => arriveInBillAsk({ question: '', ...scopedBill }));
    expect(askSession.snapshot().fresh).toBe(true);
    await act(async () => one('ask-bill-chip-clear').props.onPress());
    expect(askSession.snapshot()).toMatchObject({
      fresh: false,
      freshOptions: null,
    });
    expect(byId('ask-bill-chip')).toEqual([]);
    jest.mocked(client.askPost).mockResolvedValue({ questions: [] });
    await act(async () => {
      finish(answer);
      await running;
    });
  });

  test('while an answer runs the scope waits as a new conversation, and an emptied composer keeps it', async () => {
    let finish!: (value: unknown) => void;
    jest.mocked(client.askPost).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = askSession.submit('A running fixture question?');
    expect(askSession.snapshot().busy).toBe(true);
    act(() => arriveInBillAsk({ question: '', ...scopedBill }));
    expect(askSession.snapshot()).toMatchObject({ fresh: true, draft: '' });
    expect(askSession.composerOptions().bill).toBe(bill.key);
    act(() => askSession.setDraft('What'));
    act(() => askSession.setDraft(''));
    expect(askSession.snapshot().fresh).toBe(true);
    expect(askSession.composerOptions().bill).toBe(bill.key);
    jest.mocked(client.askPost).mockResolvedValue({ questions: [] });
    await act(async () => {
      finish(answer);
      await running;
    });
  });
});
const scopedBill = { bill: bill.key, billName: bill.name };

test.each([
  ['unfolded Duo, landscape beside the rail', 880, 669],
  ['iPad, landscape', 1180, 820],
] as const)(
  '%s: both columns are quiet, with no starters, conversations or centred mark',
  async (_name, width, height) => {
    const window = Dimensions.get('window');
    act(() => {
      Dimensions.set({ window: { ...window, width, height } });
      setWindowTraitsOverride({
        horizontal: 'regular',
        vertical: 'regular',
        foldable: width < 1000,
        verticalBars: true,
      });
      resetAdaptiveDeviceForTests();
    });
    try {
      // Nothing saved is when the centred mark and its two lines would show.
      jest.mocked(chatsSnapshot).mockImplementation(() => noChats);
      await tapAsk();
      await mount();
      expect(view!.root.findByType(AskColumns).props.docked).toBe(true);
      for (const id of [
        'ask-starters',
        'ask-pane-starters',
        'ask-conversations',
        'ask-pane-conversations',
        'ask-pane-idle-list',
        'ask-pane-idle',
        'ask-empty',
        'ask-empty-mark',
        'ask-idle',
      ])
        expect(byId(id)).toEqual([]);
      expect(hosts('ask-pane-quiet')).toHaveLength(1);
      expect(hosts('ask-bill-idle')).toHaveLength(1);
      expect(hosts('ask-bill-chip')).toHaveLength(1);
      // The × brings the pane's starters back.
      await act(async () => one('ask-bill-chip-clear').props.onPress());
      expect(hosts('ask-pane-starters')).toHaveLength(1);
      expect(byId('ask-pane-quiet')).toEqual([]);
    } finally {
      await act(async () => {
        view?.unmount();
        view = null;
        Dimensions.set({ window });
        setWindowTraitsOverride(undefined);
        resetAdaptiveDeviceForTests();
      });
    }
  },
);

test('Android: the bill is one of the options chips, with its own ×, and the hint reads "Ask about this bill"', () => {
  Object.defineProperty(Platform, 'OS', {
    configurable: true,
    value: 'android',
  });
  let dock!: ReactTestRenderer;
  act(() => {
    arriveInBillAsk({ question: '', ...scopedBill });
    dock = create(
      <AskDock
        onSend={() => {}}
        onStop={() => {}}
        onOptions={() => {}}
        offline={false}
      />,
    );
  });
  const remove = dock.root.findAll(
    (n) =>
      n.props.testID === 'ask-option-remove-bill' &&
      typeof n.props.onPress === 'function',
  )[0]!;
  expect(remove.props.accessibilityLabel).toBe(`Remove Bill, ${bill.name}`);
  expect(dock.root.findByType(TextInput).props.placeholder).toBe(
    'Ask about this bill',
  );
  expect(dock.root.findAllByProps({ testID: 'ask-bill-chip' })).toEqual([]);
  act(() => remove.props.onPress());
  expect(askSession.composerOptions()).toEqual(defaultOptions);
  act(() => dock.unmount());
});

test('the options sheet changes other options and leaves the bill’s scope alone', () => {
  act(() => arriveInBillAsk({ question: '', ...scopedBill }));
  const { bindAskOptions } = jest.requireActual(
    '../src/features/ask/Options',
  ) as typeof import('../src/features/ask/Options');
  bindAskOptions();
  const { onChange } = jest.mocked(registerFilterModel).mock.calls.at(-1)![1];
  act(() => onChange({ topic: 'housing', kind: 'all' }));
  expect(askSession.composerOptions()).toEqual({
    ...scopedOptions,
    topic: 'housing',
  });
});
