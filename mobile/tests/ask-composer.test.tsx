import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AskScreen from '../src/features/ask/AskScreen';
import { catalogs, client } from '../src/api/runtime';
import { askConsentGiven } from '../src/features/ask/consent';
import { defaultOptions, type Followup } from '../src/features/ask/model';
import {
  askQuestion,
  askSession,
  continueHeld,
  inputCopy,
} from '../src/features/ask/session';
import { AskFailure } from '../src/features/ask/stream';
import { useSeat } from '../src/features/your-mp/useSeat';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useSegments: () => ['(tabs)', '(ask)'],
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));
jest.mock('../src/api/runtime', () => ({
  client: { askPost: jest.fn() },
  catalogs: { roster: jest.fn(), slugs: jest.fn(), bills: jest.fn() },
}));
jest.mock('../src/features/ask/consent', () => ({
  askConsentGiven: jest.fn(),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
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
    forgetActiveChat: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: jest.fn(() => ({ status: 'none' })),
  savedSeatDirectory: () => ({
    electorates: {
      data: {
        electorates: [
          {
            electorate_id: 'fixture-seat',
            jurisdiction: 'federal',
            chamber: 'representatives',
            representation_status: 'verified',
            representatives: [{ person_id: 'fixture-person' }],
          },
        ],
      },
    },
  }),
}));
jest.mock('../src/features/your-mp/model', () => ({
  representativeProfile: () => ({ name: 'Sam Placeholder' }),
}));
jest.mock('../src/features/ask/AnswerView', () => ({
  AnswerView: () => null,
  SearchOpaxRow: () => null,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AskRevealContext: require('react').createContext(null),
  announceAnswer: jest.fn(),
}));
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  openAskOptions: jest.fn(),
}));
jest.mock('../src/features/ask/SourcesPane', () => ({
  AskPaneProvider: ({ children }: { children: unknown }) => children,
  useAskSources: () => ({ context: null, pane: null }),
  useAskPane: () => null,
}));

const oldDraft = 'What is in the Private Health Insurance Amendment Bill 2026?';
const answer = {
  answer: 'A fixture answer.',
  citations: {},
  sources: [
    {
      resource: 'fixture',
      title: 'Fixture record',
      snippet: 'A fixture passage.',
    },
  ],
};
const followup: Followup = { question: 'And in the previous year?' };
const suggestion: Followup = {
  question: 'Who has received the most from gambling industry donors?',
  evidence: 'A fixture passage about donations.',
  source: 'Fixture record',
};
let view: ReactTestRenderer | null = null;
const node = (id: string) =>
  view!.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
async function press(id: string) {
  await act(async () => node(id).props.onPress());
}
async function type(text: string) {
  await act(async () => node('ask-question').props.onChangeText(text));
}
const posted = () =>
  jest
    .mocked(client.askPost)
    .mock.calls.filter(([path]) => path !== '/api/followups');
async function mount(next?: Followup) {
  if (next) {
    jest
      .mocked(client.askPost)
      .mockResolvedValueOnce(answer)
      .mockResolvedValueOnce({ questions: [next] });
    await askSession.submit('An earlier fixture question?');
  }
  await act(async () => {
    view = create(<AskScreen />);
  });
  await type(oldDraft);
}
function deferAnswer() {
  let finish!: (value: unknown) => void;
  jest.mocked(client.askPost).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  return async () => {
    await act(async () => finish({ ...answer, sources: [] }));
  };
}
beforeEach(() => {
  jest.mocked(askConsentGiven).mockReset().mockResolvedValue(true);
  jest
    .mocked(client.askPost)
    .mockReset()
    .mockResolvedValue({ ...answer, sources: [] });
  jest
    .mocked(catalogs.roster)
    .mockReset()
    .mockRejectedValue(new Error('Offline'));
  jest.mocked(useSeat).mockReturnValue({ status: 'none' } as never);
  askSession.newConversation();
});
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    view?.unmount();
  });
  view = null;
  askSession.newConversation();
});

test.each([
  ['starter', undefined],
  ['follow-up', followup],
  ['suggested question', suggestion],
] as const)(
  'tapping a %s clears an existing draft as the answer starts',
  async (_name, next) => {
    await mount(next);
    const finish = deferAnswer();
    const id = next ? 'ask-followup-0' : 'ask-starter-0';
    const question = node(id).props.question;
    expect(typeof question).toBe('string');
    await press(id);
    expect(node('ask-question').props.value).toBe('');
    expect(askSession.snapshot().busy).toBe(true);
    const body = posted().at(-1)![1];
    expect(body).toMatchObject({ question });
    expect((body as { question: string }).question).not.toBe(oldDraft);
    if (next?.evidence)
      expect(body).toMatchObject({
        context: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining(next.evidence),
          }),
        ]),
      });
    await type('A new draft typed while the answer runs');
    await finish();
    expect(node('ask-question').props.value).toBe(
      'A new draft typed while the answer runs',
    );
  },
);

test.each([
  ['starter', undefined],
  ['follow-up', followup],
  ['suggested question', suggestion],
] as const)(
  'a held %s clears the old draft before consent and on replay',
  async (_name, next) => {
    await mount(next);
    jest.mocked(askConsentGiven).mockResolvedValue(false);
    const before = posted().length;
    await press(next ? 'ask-followup-0' : 'ask-starter-0');
    const held = askSession.snapshot().pending!;
    expect(held).toMatchObject({
      fromDraft: false,
      ...(next ? { carry: next } : {}),
    });
    expect(node('ask-question').props.value).toBe('');
    expect(posted()).toHaveLength(before);
    await type('Another draft entered while consent is open');
    const finish = deferAnswer();
    await act(async () => {
      void continueHeld();
    });
    expect(askSession.snapshot().pending).toBeNull();
    expect(node('ask-question').props.value).toBe('');
    expect(posted().at(-1)![1]).toMatchObject({ question: held.question });
    await finish();
    expect(node('ask-question').props.value).toBe('');
  },
);

test('Edit before asking replaces the draft without sending', async () => {
  await mount();
  const row = view!.root
    .findAllByProps({ testID: 'ask-starter-0' })
    .find((n) => n.props.menu)!;
  await act(async () => row.props.menu[0].onPress());
  expect(node('ask-question').props.value).toBe(row.props.question);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('the seat starter fills the composer and keeps its speaker options', async () => {
  jest.mocked(useSeat).mockReturnValue({
    status: 'chosen',
    choice: { version: 1, seatId: 'fixture-seat', stateSeatIds: [] },
  } as never);
  await mount();
  await press('ask-starter-seat');
  expect(node('ask-question').props.value).toBe(
    'What has Sam Placeholder said in parliament this year?',
  );
  expect(askSession.composerOptions()).toMatchObject({
    speaker: 'Sam Placeholder',
    kind: 'speech',
  });
  expect(client.askPost).not.toHaveBeenCalled();
});

test('Send still clears a typed draft', async () => {
  await mount();
  const finish = deferAnswer();
  await press('ask-submit');
  expect(node('ask-question').props.value).toBe('');
  expect(posted().at(-1)![1]).toMatchObject({ question: oldDraft });
  await finish();
});

test('a tapped question clears text before an offline roster check without changing options', async () => {
  const options = {
    ...defaultOptions,
    speaker: 'Sam Placeholder',
    kind: 'speech' as const,
  };
  askSession.options(options);
  askSession.setDraft(oldDraft);
  expect(await askQuestion(suggestion.question)).toBe(inputCopy.offline);
  expect(askSession.snapshot().draft).toBe('');
  expect(askSession.composerOptions()).toEqual(options);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('a tapped question keeps the options of an arrival that waited for an answer', async () => {
  const finish = deferAnswer();
  const running = askSession.submit('An earlier fixture question?');
  const options = { ...defaultOptions, speaker: 'Sam Placeholder' };
  askSession.arrive(oldDraft, options);
  await finish();
  await running;
  const conversationOptions = askSession.snapshot().options;
  jest.mocked(catalogs.roster).mockResolvedValue({
    data: { people: [{ name: 'Sam Placeholder' }] },
  } as never);
  await askQuestion(suggestion.question);
  expect(askSession.snapshot()).toMatchObject({ draft: '', fresh: true });
  expect(askSession.composerOptions()).toEqual(options);
  expect(askSession.snapshot().options).toEqual(conversationOptions);
});

test('an offline failure on replay restores the held question for retry', async () => {
  await mount();
  jest.mocked(askConsentGiven).mockResolvedValue(false);
  await press('ask-starter-0');
  const held = askSession.snapshot().pending!.question;
  jest
    .mocked(client.askPost)
    .mockRejectedValueOnce(new AskFailure('offline', 'Offline.'));
  await act(async () => continueHeld());
  expect(node('ask-question').props.value).toBe(held);
  const finish = deferAnswer();
  await act(async () => {
    void askSession.retry();
  });
  expect(node('ask-question').props.value).toBe('');
  expect(posted().at(-1)![1]).toMatchObject({ question: held });
  await finish();
});

test('Not now restores the tapped question instead of the old draft', async () => {
  await mount();
  jest.mocked(askConsentGiven).mockResolvedValue(false);
  await press('ask-starter-0');
  const held = askSession.snapshot().pending!.question;
  await act(async () => askSession.release());
  expect(node('ask-question').props.value).toBe(held);
  expect(client.askPost).not.toHaveBeenCalled();
});
