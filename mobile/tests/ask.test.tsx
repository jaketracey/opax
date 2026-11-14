import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import {
  ActionSheetIOS,
  Dimensions,
  Text as NativeText,
  StyleSheet,
} from 'react-native';
import { Text } from '../src/design/text';
import { colors } from '../src/design/tokens';
import {
  conversationMeta,
  conversationWhen,
  groupByDate,
} from '../src/features/ask/conversation-dates';
import type { Chat } from '../src/features/ask/model';
import AskSettings from '../src/features/ask/AskSettings';
import Conversations from '../src/features/ask/Conversations';
import {
  chatsSnapshot,
  clearAskConversations,
  deleteChats,
  loadChats,
} from '../src/features/ask/store';
import {
  deleteAllRemoteChats,
  deleteRemoteChat,
  reconcileChats,
} from '../src/features/ask/sync';
import {
  askConsentGiven,
  giveAskConsent,
  resetAskConsent,
} from '../src/features/ask/consent';
import { askSession } from '../src/features/ask/session';
import { confirmAction } from '../src/design/menu';
import { haptic } from '../src/design/haptics';
import { RouteOptions } from '../src/navigation/preview';
import { expectPublicSiteAction } from './more-menu-web';

jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  Stack: { Screen: () => null },
  router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
}));
// SwiftUI views as plain views that keep their props, so rows, swipe actions
// and context menu items can be found and pressed.
jest.mock('@expo/ui/swift-ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  const view = (kind: string) => {
    const SwiftView = ({ children, ...props }: { children?: unknown }) =>
      React.createElement(View, { ...props, swift: kind }, children);
    SwiftView.displayName = kind;
    return SwiftView;
  };
  const SwipeActions = Object.assign(view('SwipeActions'), {
    Actions: view('SwipeActions.Actions'),
  });
  const ContextMenu = Object.assign(view('ContextMenu'), {
    Trigger: view('ContextMenu.Trigger'),
    Items: view('ContextMenu.Items'),
    Preview: view('ContextMenu.Preview'),
  });
  return {
    Host: view('Host'),
    List: view('List'),
    Section: view('Section'),
    Button: view('Button'),
    Text: view('Text'),
    VStack: view('VStack'),
    ContentUnavailableView: view('ContentUnavailableView'),
    SwipeActions,
    ContextMenu,
  };
});
jest.mock(
  '@expo/ui/swift-ui/modifiers',
  () =>
    new Proxy(
      {},
      {
        get:
          (_target, name) =>
          (...args: unknown[]) => ({ modifier: name, args }),
      },
    ),
);
jest.mock('../src/features/ask/store', () => ({
  chatsSnapshot: jest.fn(() => ({ v: 1, active: null, chats: [] })),
  subscribeChats: () => () => {},
  loadChats: jest.fn().mockResolvedValue(undefined),
  saveChats: jest.fn().mockResolvedValue(undefined),
  deleteChats: jest.fn().mockResolvedValue(undefined),
  clearAskConversations: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/ask/sync', () => ({
  ChatSyncError: class extends Error {},
  reconcileChats: jest.fn(),
  deleteRemoteChat: jest.fn().mockResolvedValue(undefined),
  deleteAllRemoteChats: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/features/ask/session', () => ({
  askSession: {
    open: jest.fn(() => true),
    start: jest.fn(),
    snapshot: jest.fn(() => ({ id: null, busy: false })),
  },
}));
jest.mock('../src/features/ask/consent', () => ({
  resetAskConsent: jest.fn().mockResolvedValue(undefined),
  askConsentGiven: jest.fn().mockResolvedValue(true),
  giveAskConsent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/design/menu', () => ({ confirmAction: jest.fn() }));
jest.mock('../src/design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../src/voice/linked', () => ({ voiceLinked: true }));
const mockStatus = { current: null as null | { signedIn: boolean } };
jest.mock('../src/features/account/store', () => ({
  useAccount: () => ({ status: mockStatus.current }),
}));

const perth = 'Australia/Perth';
const sydney = 'Australia/Sydney';
const seconds = (iso: string) => Date.parse(iso) / 1000;
function chat(id: string, updated: string, questions = 1): Chat {
  return {
    id,
    title: `Question ${id}?`,
    kind: 'all',
    speaker: '',
    created: seconds(updated),
    updated: seconds(updated),
    thread: Array.from({ length: questions }, () => [
      { role: 'user' as const, text: `Question ${id}?` },
      { role: 'answer' as const, text: 'An answer.' },
    ]).flat(),
  };
}
// 11:30 pm on Monday 9 November 2026 in Perth (UTC+8).
const now = Date.parse('2026-11-09T15:30:00Z');

describe('dates in the device time zone', () => {
  test("a Perth reader at 11:30 pm finds that evening's conversation under Today", () => {
    const evening = chat('evening-chat', '2026-11-09T12:05:00Z');
    expect(groupByDate([evening], now, perth)).toEqual([
      { title: 'Today', chats: [evening] },
    ]);
    expect(conversationMeta(evening, now, perth)).toBe('1 question · 8:05 pm');
    // The same moment is already the next day in Sydney.
    expect(groupByDate([evening], now, sydney)[0]!.title).toBe('Yesterday');
  });
  test('groups run Today, Yesterday, Previous 7 days, Earlier, newest first', () => {
    const today = chat('today-chat', '2026-11-09T01:00:00Z');
    const yesterday = chat('yesterday-chat', '2026-11-08T03:00:00Z', 3);
    const tuesday = chat('tuesday-chat', '2026-11-03T03:00:00Z');
    const older = chat('older-chat', '2026-10-01T03:00:00Z');
    const lastYear = chat('last-year-chat', '2025-11-03T03:00:00Z');
    const groups = groupByDate(
      [older, lastYear, yesterday, tuesday, today],
      now,
      perth,
    );
    expect(groups.map((g) => [g.title, g.chats.map((c) => c.id)])).toEqual([
      ['Today', ['today-chat']],
      ['Yesterday', ['yesterday-chat']],
      ['Previous 7 days', ['tuesday-chat']],
      ['Earlier', ['older-chat', 'last-year-chat']],
    ]);
    expect(conversationMeta(yesterday, now, perth)).toBe(
      '3 questions · Yesterday',
    );
    expect(conversationWhen(tuesday.updated, now, perth)).toBe('Tuesday');
    // A week ago is still the previous 7 days, dated so it is not "Monday".
    expect(conversationWhen(seconds('2026-11-02T03:00:00Z'), now, perth)).toBe(
      '2 Nov',
    );
    expect(conversationWhen(seconds('2026-11-05T03:00:00Z'), now, perth)).toBe(
      'Thursday',
    );
    expect(conversationWhen(older.updated, now, perth)).toBe('1 Oct');
    expect(conversationWhen(lastYear.updated, now, perth)).toBe('3 Nov 2025');
  });
});

type Node = ReactTestRenderer['root'];
const mounted: ReactTestRenderer[] = [];
async function render(element: React.ReactElement) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(element);
  });
  mounted.push(renderer);
  return renderer.root;
}
afterEach(() => {
  act(() => mounted.splice(0).forEach((renderer) => renderer.unmount()));
});
const byID = (root: Node, testID: string) =>
  root.findAll((n) => n.props.testID === testID && typeof n.type !== 'string');
const swiftByID = (root: Node, id: string) =>
  root.find(
    (n) =>
      n.props.swift === 'Button' &&
      (
        n.props.modifiers as { modifier: string; args: unknown[] }[] | undefined
      )?.some(
        (m) => m.modifier === 'accessibilityIdentifier' && m.args[0] === id,
      ),
  );
const stored = (chats: Chat[]) =>
  jest.mocked(chatsSnapshot).mockReturnValue({ v: 1, active: null, chats });

beforeEach(() => {
  jest.clearAllMocks();
  mockStatus.current = null;
  stored([]);
  jest.mocked(loadChats).mockResolvedValue(undefined);
  jest.mocked(reconcileChats).mockImplementation(async (local) => local);
  jest.mocked(askSession.snapshot).mockReturnValue({
    id: null,
    busy: false,
  } as ReturnType<typeof askSession.snapshot>);
});

describe('Account › Ask', () => {
  test('three rows with saved conversations; Delete all is last', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<AskSettings />);
    const ids = root
      .findAll(
        (n) =>
          typeof n.props.testID === 'string' &&
          n.props.testID.startsWith('ask-settings-') &&
          typeof n.type !== 'string',
      )
      .map((n) => n.props.testID as string)
      .filter((id, i, all) => all.indexOf(id) === i);
    expect(ids).toEqual([
      'ask-settings-conversations',
      'ask-settings-notice',
      'ask-settings-delete-all',
    ]);
    const saved = byID(root, 'ask-settings-conversations')[0]!;
    expect(saved.props.title).toBe('Saved conversations');
    expect(saved.props.value).toBe('1');
    act(() => saved.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/account/conversations');
  });
  test('Delete all is hidden when nothing is saved', async () => {
    const root = await render(<AskSettings />);
    expect(byID(root, 'ask-settings-delete-all')).toHaveLength(0);
    expect(byID(root, 'ask-settings-notice')).not.toHaveLength(0);
  });
  test('Delete all is confirmed, then removes them here and from the account', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<AskSettings />);
    act(() => byID(root, 'ask-settings-delete-all')[0]!.props.onPress());
    const [title, actions] = jest.mocked(confirmAction).mock.calls[0]!;
    expect(title).toBe('Delete all conversations?');
    expect(actions).toEqual([
      expect.objectContaining({ title: 'Delete', destructive: true }),
    ]);
    // confirmAction adds Cancel: the sheet reads Delete and Cancel.
    const sheet = jest
      .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
      .mockImplementation(() => undefined);
    jest
      .requireActual<typeof import('../src/design/menu')>('../src/design/menu')
      .confirmAction(title, actions);
    expect(sheet.mock.calls[0]![0]).toMatchObject({
      title: 'Delete all conversations?',
      options: ['Delete', 'Cancel'],
      cancelButtonIndex: 1,
      destructiveButtonIndex: [0],
    });
    sheet.mockRestore();
    await act(async () => actions[0]!.onPress());
    expect(clearAskConversations).toHaveBeenCalled();
    expect(deleteAllRemoteChats).not.toHaveBeenCalled();
  });
  test('signed in, the confirmation says the account copies go too', async () => {
    mockStatus.current = { signedIn: true };
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<AskSettings />);
    act(() => byID(root, 'ask-settings-delete-all')[0]!.props.onPress());
    const [title, actions] = jest.mocked(confirmAction).mock.calls[0]!;
    expect(title).toBe(
      'Delete all conversations?\nThey’ll also be removed from your OPAX account.',
    );
    await act(async () => actions[0]!.onPress());
    expect(deleteAllRemoteChats).toHaveBeenCalled();
  });
  test.each([1, 3.12])(
    'the notice is a Switch at scale %s and resets consent',
    async (fontScale) => {
      const previous = Dimensions.get('window');
      act(() => Dimensions.set({ window: { ...previous, fontScale } }));
      const root = await render(<AskSettings />);
      try {
        const row = byID(root, 'ask-settings-notice')[0]!;
        const button = row.findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.accessibilityRole === 'switch',
        )[0]!;
        expect(button.props.accessibilityLabel).toBe(
          'Show the notice before asking',
        );
        expect(button.props.accessibilityState?.checked).toBe(false);
        expect(row.findByType(Text).props).toMatchObject({
          wordSafe: true,
          variant: 'strong',
          tone: 'ink',
        });
        const label = row.findByType(NativeText);
        expect(StyleSheet.flatten(label.props.style).color).toBe(colors.ink);
        expect(label.props.allowFontScaling).toBe(true);
        expect(label.props.numberOfLines).toBeUndefined();
        await act(async () => row.props.onValueChange(true));
        expect(resetAskConsent).toHaveBeenCalled();
        expect(haptic).toHaveBeenCalledWith('success');
        expect(askConsentGiven).toHaveBeenCalled();
        await act(async () => row.props.onValueChange(false));
        expect(giveAskConsent).toHaveBeenCalled();
      } finally {
        act(() => Dimensions.set({ window: previous }));
      }
    },
  );
});

describe('Conversations', () => {
  test.each(['sheet', 'account'] as const)(
    '%s More opens a public page accepted by the URL guard',
    async (mode) => {
      stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
      const root = await render(<Conversations mode={mode} />);
      const items = root
        .findByType(RouteOptions)
        .props.options.unstable_headerRightItems();
      const more = items.find((item: { type: string }) => item.type === 'menu');
      expectPublicSiteAction(more.menu.items, '/');
    },
  );
  test('native row labels use adaptive ink roles instead of the button tint', async () => {
    const saved = chat('first-chat', '2026-11-09T01:00:00Z');
    stored([saved]);
    const root = await render(<Conversations mode="sheet" />);
    const row = swiftByID(root, 'ask-restore-0');
    const labels = row.findAll(
      (n) => n.type === 'View' && n.props.swift === 'Text',
    );
    expect(labels.map((n) => n.props.children)).toEqual([
      saved.title,
      conversationMeta(saved, Date.now()),
    ]);
    for (const [index, colour] of [colors.ink, colors.inkSoft].entries()) {
      expect(labels[index]!.props.modifiers).toContainEqual({
        modifier: 'foregroundStyle',
        args: [colour],
      });
      // DynamicColorIOS carries all four appearance/contrast variants to SwiftUI.
      expect(colour).toHaveProperty('dynamic.light');
      expect(colour).toHaveProperty('dynamic.dark');
      expect(colour).toHaveProperty('dynamic.highContrastLight');
      expect(colour).toHaveProperty('dynamic.highContrastDark');
    }
    act(() => row.props.onPress());
    expect(askSession.open).toHaveBeenCalledWith(saved.id);
    expect(router.back).toHaveBeenCalled();
  });
  test('loading shows a skeleton, never "No conversations yet"', async () => {
    jest.mocked(loadChats).mockReturnValue(new Promise(() => {}));
    const root = await render(<Conversations mode="sheet" />);
    expect(byID(root, 'ask-history-loading')).not.toHaveLength(0);
    expect(byID(root, 'ask-history-empty')).toHaveLength(0);
  });
  test('empty after reading: No conversations yet and the sign-in row', async () => {
    const root = await render(<Conversations mode="sheet" />);
    expect(byID(root, 'ask-history-empty')[0]!.props.title).toBe(
      'No conversations yet',
    );
    expect(byID(root, 'ask-history-footer')[0]!.props.children).toBe(
      'Saved on this iPhone.',
    );
    act(() => byID(root, 'ask-history-sign-in')[0]!.props.onPress());
    expect(router.push).toHaveBeenCalledWith('/account/sign-in');
  });
  test('a failed read offers Try again', async () => {
    jest.mocked(loadChats).mockRejectedValueOnce(new Error('unreadable'));
    const root = await render(<Conversations mode="sheet" />);
    const failed = byID(root, 'ask-history-read-failed')[0]!;
    expect(failed.props.title).toBe('Conversations couldn’t be read');
    expect(failed.props.action.label).toBe('Try again');
  });
  test('a row restores its conversation and closes the sheet', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<Conversations mode="sheet" />);
    act(() => swiftByID(root, 'ask-restore-0').props.onPress());
    expect(askSession.open).toHaveBeenCalledWith('first-chat');
    expect(router.back).toHaveBeenCalled();
  });
  test('while an answer is being written, a row stays put rather than closing on nothing', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    jest.mocked(askSession.open).mockReturnValueOnce(false);
    const root = await render(<Conversations mode="sheet" />);
    act(() => swiftByID(root, 'ask-restore-0').props.onPress());
    expect(router.back).not.toHaveBeenCalled();
  });
  test('from Account, a row opens the conversation in the Ask tab', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<Conversations mode="account" />);
    act(() => swiftByID(root, 'ask-restore-0').props.onPress());
    expect(askSession.open).toHaveBeenCalledWith('first-chat');
    expect(router.navigate).toHaveBeenCalledWith('/ask');
    expect(router.back).not.toHaveBeenCalled();
  });
  test('swipe Delete removes it here; signed in, from the account too', async () => {
    mockStatus.current = { signedIn: true };
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    const root = await render(<Conversations mode="sheet" />);
    const swipe = root.find((n) => n.props.swift === 'SwipeActions.Actions');
    const del = swipe.find((n) => n.props.swift === 'Button');
    expect(del.props).toMatchObject({ role: 'destructive', label: 'Delete' });
    await act(async () => del.props.onPress());
    expect(deleteChats).toHaveBeenCalledWith(['first-chat']);
    expect(deleteRemoteChat).toHaveBeenCalledWith('first-chat');
    // The context menu offers the same Delete.
    const items = root.find((n) => n.props.swift === 'ContextMenu.Items');
    expect(items.find((n) => n.props.swift === 'Button').props.label).toBe(
      'Delete',
    );
  });
  test('signed out, Delete stays on this device', async () => {
    stored([chat('first-chat', '2026-11-09T01:00:00Z')]);
    jest.mocked(askSession.snapshot).mockReturnValue({
      id: 'first-chat',
      busy: false,
    } as ReturnType<typeof askSession.snapshot>);
    mockStatus.current = { signedIn: false };
    const root = await render(<Conversations mode="sheet" />);
    const del = root
      .find((n) => n.props.swift === 'SwipeActions.Actions')
      .find((n) => n.props.swift === 'Button');
    await act(async () => del.props.onPress());
    expect(deleteChats).toHaveBeenCalledWith(['first-chat']);
    expect(deleteRemoteChat).not.toHaveBeenCalled();
    // The open conversation was the one deleted.
    expect(askSession.start).toHaveBeenCalled();
  });
});

test('the notice Switch cannot replace first-question consent', async () => {
  jest.mocked(askConsentGiven).mockResolvedValueOnce(false);
  const root = await render(<AskSettings />);
  const row = byID(root, 'ask-settings-notice')[0]!;
  expect(row.props).toMatchObject({ value: true, disabled: true });
  await act(async () => row.props.onValueChange(false));
  expect(giveAskConsent).not.toHaveBeenCalled();
});
