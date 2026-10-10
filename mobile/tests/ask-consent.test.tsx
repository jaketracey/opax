import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text as NativeText } from 'react-native';
import { AskConsent } from '../src/features/ask/AskConsent';
import AskScreen from '../src/features/ask/AskScreen';
import { Builder } from '../src/features/ask/QuestionBuilder';
import { client } from '../src/api/runtime';
import { askSession } from '../src/features/ask/session';
import { resetAskConsentForTests } from '../src/features/ask/consent';
import { sampleQuestions } from '../src/features/ask/model';
import { openOnWeb } from '../src/navigation/external';

// Guideline 5.1.2(i): before the first Ask question leaves the device, the
// reader agrees to it going to OPAX's server, Progress Agentic RAG and an AI
// model through OpenRouter. Asked once, stored on the device.
const mockDisk = new Map<string, string>();
jest.mock('expo-file-system', () => ({
  Paths: { document: 'documents' },
  File: class {
    name: string;
    constructor(_directory: unknown, name: string) {
      this.name = name;
    }
    get exists() {
      return mockDisk.has(this.name);
    }
    async text() {
      return mockDisk.get(this.name)!;
    }
    write(body: string) {
      mockDisk.set(this.name, body);
    }
  },
}));
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
jest.mock('../src/navigation/external', () => ({
  openOnWeb: jest.fn(),
}));
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: null }),
  accountSnapshot: () => ({ status: null }),
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
  const { Text, View } = require('react-native');
  const basic = (p: Record<string, unknown>) =>
    React.createElement(View, p, p.children);
  return {
    ...Object.fromEntries(
      [
        'Screen',
        'KeyboardStableScreen',
        'Icon',
        'IconButton',
        'Field',
        'Group',
        'Heading',
        'FilterChip',
        'Section',
        'RowList',
        'Disclosure',
        'ErrorState',
        'EmptyState',
        'LoadingState',
        'ChoiceChips',
      ].map((k) => [k, basic]),
    ),
    Text: (p: Record<string, unknown>) =>
      React.createElement(Text, p, p.children),
    // Labels as text, so the consent's words can be counted.
    Button: (p: Record<string, unknown>) =>
      React.createElement(View, p, React.createElement(Text, null, p.label)),
    LinkRow: (p: Record<string, unknown>) =>
      React.createElement(View, p, React.createElement(Text, null, p.title)),
    MachineLabel: (p: Record<string, unknown>) =>
      React.createElement(View, { testID: p.testID }),
    Composer: (p: Record<string, unknown> & { onSubmit: () => void }) =>
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
jest.mock('../src/features/ask/AnswerView', () => ({
  AnswerView: () => null,
  machineNote:
    'Written by a model from the retrieved passages; not the record.',
}));
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  Options: () => null,
}));

const answer = { answer: 'A synthetic answer.', sources: [] };
const posted = () =>
  jest
    .mocked(client.askPost)
    .mock.calls.map(([, body]) => (body as { question: string }).question);
const consentFile = () =>
  [...mockDisk.entries()].filter(([name]) =>
    name.startsWith('opax-ask-consent'),
  );

let view: ReactTestRenderer;
beforeEach(async () => {
  mockDisk.clear();
  resetAskConsentForTests();
  jest.mocked(client.askPost).mockReset().mockResolvedValue(answer);
  askSession.start();
  await act(async () => {
    view = create(<AskScreen />);
  });
});
afterEach(() => {
  act(() => view.unmount());
  askSession.start();
});

const byId = (id: string) =>
  view.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
const shown = (id: string) =>
  view.root.findAll((n) => n.props.testID === id).length > 0;
async function press(id: string) {
  await act(async () => {
    byId(id).props.onPress();
  });
}
async function ask(question: string, field = 'ask-question') {
  act(() => byId(field).props.onChangeText(question));
  await press(field === 'ask-question' ? 'ask-submit' : 'ask-followup-submit');
}
function consentWords() {
  const sheet = view.root.findByType(AskConsent);
  return sheet
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join(' ');
}

test('a first question shows the consent and sends nothing', async () => {
  await ask('Who spoke on housing?');
  expect(shown('ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
  const words = consentWords();
  for (const part of [
    'Your question, with the earlier questions and answers in this conversation',
    'OPAX’s server',
    'Progress Agentic RAG',
    'OpenRouter',
    'Answers are machine-written',
    'personal information',
    'Privacy',
    'Continue',
    'Not now',
  ])
    expect(words).toContain(part);
  // Plain, short and in sentence case.
  expect(words.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(60);
  expect(words).not.toMatch(/\b[A-Z]{2,}\b(?<!OPAX|RAG|AI)/);
  expect(shown('ask-consent-machine')).toBe(true);
  await press('ask-consent-privacy');
  expect(openOnWeb).toHaveBeenCalledWith('/privacy', 'Privacy');
});

test('Not now leaves the question unsent and the composer intact', async () => {
  await ask('Who spoke on housing?');
  await press('ask-consent-not-now');
  expect(shown('ask-consent')).toBe(false);
  expect(client.askPost).not.toHaveBeenCalled();
  expect(byId('ask-question').props.value).toBe('Who spoke on housing?');
  expect(consentFile()).toEqual([]);
  // Asked again next time, since nothing was agreed.
  await press('ask-submit');
  expect(shown('ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('Continue sends the held question; the next one goes straight through', async () => {
  await ask('Who spoke on housing?');
  await press('ask-consent-continue');
  expect(shown('ask-consent')).toBe(false);
  expect(posted()).toEqual(['Who spoke on housing?']);
  expect(consentFile()).toHaveLength(1);
  expect(JSON.parse(consentFile()[0]![1])).toEqual({
    version: 1,
    generation: 1,
  });
  await ask('And on rents?', 'ask-followup-field');
  expect(shown('ask-consent')).toBe(false);
  expect(posted()).toEqual(['Who spoke on housing?', 'And on rents?']);
});

test('suggested questions and the builder go through the same gate', async () => {
  await press('ask-sample-0');
  expect(shown('ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
  await press('ask-consent-not-now');
  const builder = view.root.findByType(Builder);
  await act(async () => builder.props.onSubmit('What does the bill change?'));
  expect(shown('ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
  await press('ask-consent-continue');
  expect(posted()).toEqual(['What does the bill change?']);
  expect(sampleQuestions.length).toBeGreaterThan(0);
});

test('the agreement is kept on the device, asked once', async () => {
  await ask('Who spoke on housing?');
  await press('ask-consent-continue');
  // A new launch reads the stored agreement.
  act(() => view.unmount());
  askSession.start();
  resetAskConsentForTests();
  await act(async () => {
    view = create(<AskScreen />);
  });
  await ask('Who spoke on rents?');
  expect(shown('ask-consent')).toBe(false);
  expect(posted()).toEqual(['Who spoke on housing?', 'Who spoke on rents?']);
});

test('an unreadable or foreign agreement asks again', async () => {
  act(() => view.unmount());
  mockDisk.set('opax-ask-consent-v1.json', '{"version":"yes"}');
  mockDisk.set('opax-ask-consent-v1.b.json', 'not json');
  askSession.start();
  resetAskConsentForTests();
  await act(async () => {
    view = create(<AskScreen />);
  });
  await ask('Who spoke on housing?');
  expect(shown('ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
});
