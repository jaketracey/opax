import Constants from 'expo-constants';
import { router } from 'expo-router';
import { act, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Button, Card, Icon, Text } from '../src/design/primitives';
import { useAccountSignedIn } from '../src/features/account/store';
import Today from '../src/features/Today';
import { AskBlock } from '../src/features/today/AskBlock';
import { readCachedEdition } from '../src/features/today/edition-store';
import { todayColumns, todayOrder } from '../src/features/today/order';
import { sydneyDay } from '../src/features/today/rules';
import { VoiceCard } from '../src/features/today/VoiceCard';

let mockVoiceLinked = true;
let mockTalkInAsk = true;
jest.mock('../src/voice/linked', () => ({
  get voiceLinked() {
    return mockVoiceLinked;
  },
}));
jest.mock('../src/design/flags', () => ({
  designFlags: {
    categorySymbols: true,
    searchTab: true,
    groupedSurfaces: true,
    get talkInAsk() {
      return mockTalkInAsk;
    },
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'development' } } },
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const Native = jest.requireActual('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  const Link = Object.assign(Wrap, {
    Trigger: Wrap,
    Preview: () => null,
    Menu: () => null,
    MenuAction: () => null,
  });
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
    useFocusEffect: jest.fn(),
  };
});
jest.mock('../src/features/account/store', () => ({
  useAccountSignedIn: jest.fn(),
}));
// Keep Today's real order, Ask block and voice card; other feeds own their tests.
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    todayEdition: jest.fn(async () => ({ status: 'missing' })),
  },
}));
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('../src/features/today/edition-store', () => ({
  readCachedEdition: jest.fn(async () => null),
  rememberEdition: jest.fn(async () => undefined),
}));
jest.mock('../src/features/today/invitation-store', () => ({
  readInvitationDates: jest.fn(async () => ({
    hiddenUntil: null,
    welcomeDeclinedAt: null,
  })),
  subscribeInvitation: () => () => undefined,
}));
jest.mock('../src/features/today/SeatInvitation', () => ({
  SeatInvitation: () => null,
}));
jest.mock('../src/features/today/YourMPCard', () => ({
  YourMPCard: () => null,
  StateSeatCard: () => null,
}));
jest.mock('../src/features/today/DailyPair', () => ({ DailyPair: () => null }));
jest.mock('../src/features/today/BillFeed', () => ({ BillsBlock: () => null }));
jest.mock('../src/features/today/DeclarationRow', () => ({
  DeclarationsBlock: () => null,
}));
jest.mock('../src/features/today/VotesBlock', () => ({
  VotesBlock: () => null,
}));
jest.mock('../src/features/follows/FollowingSection', () => ({
  FollowingSection: () => null,
}));
jest.mock('../src/features/today/MoreToExplore', () => ({
  MoreToExplore: () => null,
}));
jest.mock('../src/features/ask/open', () => ({ useOpenAsk: () => jest.fn() }));
jest.mock('../src/launch/splash', () => ({ releaseSplash: jest.fn() }));

const standard = { width: 390, height: 844, scale: 3, fontScale: 1 };
const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement = <VoiceCard />) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
const host = (root: ReactTestInstance, testID: string) =>
  root.find(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );

/** Buttons exposed to a reader, excluding hidden native subtrees. */
function accessibleButtons(node: ReactTestInstance): ReactTestInstance[] {
  if (
    typeof node.type === 'string' &&
    (node.props.accessibilityElementsHidden ||
      node.props.importantForAccessibility === 'no-hide-descendants')
  )
    return [];
  const own =
    typeof node.type === 'string' && node.props.accessibilityRole === 'button'
      ? [node]
      : [];
  return [
    ...own,
    ...node.children.flatMap((child) =>
      typeof child === 'string' ? [] : accessibleButtons(child),
    ),
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVoiceLinked = true;
  mockTalkInAsk = true;
  Constants.expoConfig!.extra = { variant: 'development' };
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
  jest.mocked(readCachedEdition).mockResolvedValue(null);
});
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((r) => r.unmount()));
});

test.each([false, true])(
  'offers Talk directly with signedIn=%s, leaving sign-in and consent to Talk',
  async (signedIn) => {
    jest.mocked(useAccountSignedIn).mockReturnValue(signedIn);
    const { root } = await render();
    expect(root.findByType(Card).props).toMatchObject({
      testID: 'today-voice',
      accessibilityLabel: 'Start a voice chat',
      accessibilityHint: 'Talk to OPAX about parliament',
    });
    expect(root.findAllByType(Text).map((text) => text.props.children)).toEqual(
      expect.arrayContaining([
        'Talk it through',
        'Ask about a bill, a vote or your MP, out loud. Answers come with sources.',
      ]),
    );
    expect(root.findByType(Button).props).toMatchObject({
      label: 'Start a voice chat',
      variant: 'primary',
      fullWidth: true,
      testID: 'today-voice-start',
    });
    expect(router.push).not.toHaveBeenCalled();
    act(() => root.findByType(Card).props.onPress());
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/talk' });
    expect(useAccountSignedIn).not.toHaveBeenCalled();
  },
);

test('the visible primary action also pushes /talk', async () => {
  const { root } = await render();
  act(() => root.findByType(Button).props.onPress());
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledWith({ pathname: '/talk' });
});

test.each([
  [false, true],
  [true, false],
  [false, false],
])('hidden when voiceLinked=%s and talkInAsk=%s', async (linked, flag) => {
  mockVoiceLinked = linked;
  mockTalkInAsk = flag;
  const renderer = await render();
  expect(renderer.toJSON()).toBeNull();
});

test.each([undefined, false, true])(
  'production respects its voice build switch (%s), even with iOS voiceLinked',
  async (enabled) => {
    Constants.expoConfig!.extra = {
      variant: 'production',
      productionVoiceEnabled: enabled,
    };
    const renderer = await render();
    if (enabled) expect(host(renderer.root, 'today-voice')).toBeDefined();
    else expect(renderer.toJSON()).toBeNull();
  },
);

test.each([1, 3.571])(
  'one accessible button, wrapping text and a reachable action at font scale %s',
  async (fontScale) => {
    jest.mocked(useWindowDimensions).mockReturnValue({
      ...standard,
      width: 320,
      fontScale,
    });
    const { root } = await render();
    expect(accessibleButtons(root).map((node) => node.props.testID)).toEqual([
      'today-voice',
    ]);
    expect(host(root, 'today-voice').props).toMatchObject({
      accessible: true,
      accessibilityRole: 'button',
      accessibilityLabel: 'Start a voice chat',
      accessibilityHint: 'Talk to OPAX about parliament',
    });
    const text = root.findAll((node) => node.type === 'Text');
    expect(text.length).toBeGreaterThanOrEqual(3);
    for (const node of text) {
      expect(node.props.numberOfLines).toBeUndefined();
      expect(node.props.allowFontScaling).not.toBe(false);
      const style = StyleSheet.flatten(node.props.style);
      expect(style?.height).toBeUndefined();
      expect(style?.maxHeight).toBeUndefined();
    }
    const icon = root.findByType(Icon);
    expect(icon.props).toMatchObject({ name: 'waveform', maxScale: 1 });
    expect(icon.props.animation).toBeUndefined();
    act(() => root.findByType(Button).props.onPress());
    expect(router.push).toHaveBeenCalledWith({ pathname: '/talk' });
  },
);

test.each(['A', 'B', 'C'] as const)(
  'Today draws voice directly before Ask in launch case %s',
  async (launchCase) => {
    const today = sydneyDay();
    jest
      .mocked(readCachedEdition)
      .mockResolvedValue(
        launchCase === 'A'
          ? { date: today }
          : launchCase === 'B'
            ? 'missing'
            : null,
      );
    const { root } = await render(<Today />);
    const ids = root
      .findAll((node) => typeof node.type === 'string' && !!node.props.testID)
      .map((node) => node.props.testID);
    expect(
      ids.filter((id) =>
        ['today-voice', 'today-ask', 'today-foot'].includes(id),
      ),
    ).toEqual(['today-voice', 'today-ask', 'today-foot']);
    const voice = root.findByType(VoiceCard);
    const siblings = voice.parent!.children;
    expect(siblings[siblings.indexOf(voice) + 1]).toBe(
      root.findByType(AskBlock),
    );
    // The Ask slot also sits in the trailing iPad column in every case.
    const order = todayOrder({
      seat: false,
      invitation: { hiddenUntil: null, welcomeDeclinedAt: null },
      launchCase,
      today,
    });
    expect(order.slots.slice(-2)).toEqual(['ask', 'foot']);
    expect(todayColumns(order).trailing.at(-1)).toBe('ask');
  },
);

test('Today retains Ask when voice is hidden', async () => {
  mockVoiceLinked = false;
  const { root } = await render(<Today />);
  expect(
    root
      .findAllByType(Card)
      .filter((card) => card.props.testID === 'today-voice'),
  ).toHaveLength(0);
  expect(host(root, 'today-ask')).toBeDefined();
});
