import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text as NativeText } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AskConsent, { consentCopy } from '../src/features/ask/AskConsent';
import AskScreen from '../src/features/ask/AskScreen';
import { client } from '../src/api/runtime';
import { askSession } from '../src/features/ask/session';
import { resetAskConsentForTests } from '../src/features/ask/consent';
import { askConsentRoute } from '../src/navigation/routes/ask';
import { openOnWeb } from '../src/navigation/external';

// Guideline 5.1.2(i): before the first Ask question leaves the device, the
// reader agrees to it going to OPAX's server, Progress Agentic RAG and an AI
// model through OpenRouter. Asked once, stored on the device. The sheet is a
// route (A1): the question is held by the session while it is open.
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
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  useLocalSearchParams: jest.fn(() => ({})),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true },
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
  openSource: jest.fn(),
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
    forgetActiveChat: jest.fn(),
    clearAskConversations: jest.fn(),
  };
});
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: jest.requireActual('../src/features/ask/sync').ChatSyncError,
  syncSubmittedChat: jest.fn().mockResolvedValue(undefined),
  deleteRemoteChat: jest.fn(),
  reconcileChats: jest.fn(),
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/ask/SourcesPane', () => ({
  AskPaneProvider: ({ children }: { children: unknown }) => children,
  useAskSources: () => ({ context: null, onScroll: undefined, pane: null }),
  useAskPane: () => null,
}));
jest.mock('../src/features/ask/Options', () => ({
  topics: { housing: 'Housing' },
  openAskOptions: jest.fn(),
}));

const answer = { answer: 'A synthetic answer.', citations: {}, sources: [] };
const posted = () =>
  jest
    .mocked(client.askPost)
    .mock.calls.filter(([path]) => path !== '/api/followups')
    .map(([, body]) => (body as { question: string }).question);
const consentFile = () =>
  [...mockDisk.entries()].filter(([name]) =>
    name.startsWith('opax-ask-consent'),
  );

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
let view: ReactTestRenderer;
let sheet: ReactTestRenderer | null = null;
async function launch() {
  await act(async () => {
    view = create(<AskScreen />);
  });
}
beforeEach(async () => {
  mockDisk.clear();
  resetAskConsentForTests();
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
  jest.mocked(client.askPost).mockReset().mockResolvedValue(answer);
  askSession.start();
  askSession.setDraft('');
  await launch();
});
afterEach(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
    sheet?.unmount();
    view.unmount();
  });
  sheet = null;
  askSession.start();
  askSession.setDraft('');
});

const pressable = (root: ReactTestRenderer, id: string) =>
  root.root.findAll(
    (n) =>
      n.props.testID === id &&
      (typeof n.props.onPress === 'function' ||
        typeof n.props.onChangeText === 'function'),
  )[0]!;
const shown = (root: ReactTestRenderer | null, id: string) =>
  !!root && root.root.findAll((n) => n.props.testID === id).length > 0;
async function press(root: ReactTestRenderer, id: string) {
  await act(async () => {
    await pressable(root, id).props.onPress();
  });
}
/** Types and sends; when consent is asked for, the route sheet opens. */
async function ask(question: string) {
  act(() => pressable(view, 'ask-question').props.onChangeText(question));
  await press(view, 'ask-submit');
  await openSheetIfPushed();
}
async function openSheetIfPushed() {
  const pushed = jest
    .mocked(router.push)
    .mock.calls.some(([to]) => to === askConsentRoute);
  if (!pushed || sheet) return;
  await act(async () => {
    sheet = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AskConsent />
      </SafeAreaProvider>,
    );
  });
}
async function leave(id: 'ask-consent-continue' | 'ask-consent-not-now') {
  await press(sheet!, id);
  await act(async () => sheet!.unmount());
  sheet = null;
  jest.mocked(router.push).mockClear();
}
function consentWords() {
  return sheet!.root
    .findAllByType(NativeText)
    .map((n) => n.props.children)
    .flat(Infinity)
    .filter((c) => typeof c === 'string')
    .join(' ');
}

test('a first question opens the consent sheet and sends nothing', async () => {
  await ask('Who spoke on housing?');
  expect(router.push).toHaveBeenCalledWith(askConsentRoute);
  expect(shown(sheet, 'ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
  expect(askSession.snapshot().pending?.question).toBe('Who spoke on housing?');
  const words = consentWords();
  for (const part of [
    "Your question and this conversation go to OPAX's server.",
    'Progress Agentic RAG',
    'OpenRouter',
    'Answers can be wrong, so check the cited records.',
    "Don't include personal details.",
    'Privacy',
    'Continue',
    'Not now',
  ])
    expect(words).toContain(part);
  expect(words).not.toMatch(/—/);
  // Plain and short.
  expect(consentCopy.body.split(/\s+/).length).toBeLessThanOrEqual(50);
  // The pill once, and no sentence repeats "machine-written".
  expect(shown(sheet, 'ask-consent-machine')).toBe(true);
  expect(words.match(/machine-written/gi)).toHaveLength(1);
  // The two buttons are the only exits: no ✕ and no Done.
  expect(shown(sheet, 'ask-consent-close')).toBe(false);
  await press(sheet!, 'ask-consent-privacy');
  expect(openOnWeb).toHaveBeenCalledWith('/privacy', 'Privacy');
});

test('Not now leaves the question unsent and in the composer', async () => {
  await ask('Who spoke on housing?');
  await leave('ask-consent-not-now');
  expect(router.back).toHaveBeenCalled();
  expect(client.askPost).not.toHaveBeenCalled();
  expect(askSession.snapshot().pending).toBeNull();
  expect(pressable(view, 'ask-question').props.value).toBe(
    'Who spoke on housing?',
  );
  expect(consentFile()).toEqual([]);
  // Asked again next time, since nothing was agreed.
  await press(view, 'ask-submit');
  await openSheetIfPushed();
  expect(shown(sheet, 'ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
});

test('a swipe down is Not now', async () => {
  await ask('Who spoke on housing?');
  await act(async () => sheet!.unmount());
  sheet = null;
  expect(askSession.snapshot().pending).toBeNull();
  expect(client.askPost).not.toHaveBeenCalled();
  expect(consentFile()).toEqual([]);
  expect(pressable(view, 'ask-question').props.value).toBe(
    'Who spoke on housing?',
  );
});

test('Continue sends the held question; the next one goes straight through', async () => {
  await ask('Who spoke on housing?');
  await leave('ask-consent-continue');
  expect(posted()).toEqual(['Who spoke on housing?']);
  expect(consentFile()).toHaveLength(1);
  expect(JSON.parse(consentFile()[0]![1])).toEqual({
    version: 1,
    generation: 1,
  });
  await ask('And on rents?');
  expect(router.push).not.toHaveBeenCalledWith(askConsentRoute);
  expect(sheet).toBeNull();
  expect(posted()).toEqual(['Who spoke on housing?', 'And on rents?']);
});

test('a starter goes through the same gate, and Not now leaves it in the composer', async () => {
  const starter = view.root
    .findAll((n) => n.props.testID === 'ask-starter-0')
    .map((n) => n.props.accessibilityLabel)
    .find((label) => typeof label === 'string') as string;
  await press(view, 'ask-starter-0');
  await openSheetIfPushed();
  expect(shown(sheet, 'ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
  await leave('ask-consent-not-now');
  expect(pressable(view, 'ask-question').props.value).toBe(starter);
  await press(view, 'ask-starter-1');
  await openSheetIfPushed();
  const second = askSession.snapshot().pending!.question;
  await leave('ask-consent-continue');
  expect(posted()).toEqual([second]);
});

test('the agreement is kept on the device, asked once', async () => {
  await ask('Who spoke on housing?');
  await leave('ask-consent-continue');
  // A new launch reads the stored agreement.
  await act(async () => view.unmount());
  askSession.start();
  resetAskConsentForTests();
  await launch();
  await ask('Who spoke on rents?');
  expect(sheet).toBeNull();
  expect(posted()).toEqual(['Who spoke on housing?', 'Who spoke on rents?']);
});

test('an unreadable or foreign agreement asks again', async () => {
  await act(async () => view.unmount());
  mockDisk.set('opax-ask-consent-v1.json', '{"version":"yes"}');
  mockDisk.set('opax-ask-consent-v1.b.json', 'not json');
  askSession.start();
  resetAskConsentForTests();
  await launch();
  await ask('Who spoke on housing?');
  expect(shown(sheet, 'ask-consent')).toBe(true);
  expect(client.askPost).not.toHaveBeenCalled();
});

// Build 61 at AX5: the uncapped scroll view ran below the sheet, its range
// ended at "Answers can be wrong…", and Continue never came on screen. The
// scroll view is now capped at the space the sheet can use, so its range
// ends at the buttons; at Large the cap does nothing and the sheet is as it
// was.
test('the consent scroll view is capped at the sheet and ends at both buttons', async () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { ScrollView, StyleSheet } = require('react-native');
  const { SHEET_HEADER } = require('../src/features/sheets/fitted');
  const { rhythm } = require('../src/design/tokens');
  /* eslint-enable @typescript-eslint/no-require-imports */
  await ask('Who spoke on housing?');
  // The jest window is 750 pt tall unless a test sets one.
  const { height } = jest
    .requireActual('react-native')
    .Dimensions.get('window');
  const scroll = sheet!.root.findByType(ScrollView);
  expect(scroll.props.testID).toBe('ask-consent');
  expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBe(
    height - metrics.insets.top - SHEET_HEADER,
  );
  // Large is unchanged: the same insets, gaps and foot as build 61.
  expect(scroll.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({
    gap: rhythm.group,
    paddingTop: rhythm.block,
    paddingBottom: rhythm.block + metrics.insets.bottom,
  });
  // The buttons are the last thing in the scroll range, Not now at the end.
  const hosts = scroll.findAll(
    (n) => typeof n.type === 'string' && typeof n.props.testID === 'string',
  );
  const ids = hosts.map((n) => n.props.testID as string);
  const actions = ids.indexOf('ask-consent-actions');
  expect(actions).toBeGreaterThan(ids.indexOf('ask-consent-privacy'));
  expect(ids.indexOf('ask-consent-continue')).toBeGreaterThan(actions);
  expect(ids.indexOf('ask-consent-not-now')).toBeGreaterThan(
    ids.indexOf('ask-consent-continue'),
  );
});
