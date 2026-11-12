import { router } from 'expo-router';
import { act, type ReactElement, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import { Button, Icon } from '../src/design/primitives';
import { useAccount } from '../src/features/account/store';
import Today from '../src/features/Today';
import { AskBlock } from '../src/features/today/AskBlock';
import { readCachedEdition } from '../src/features/today/edition-store';
import { todayColumns, todayOrder } from '../src/features/today/order';
import { sydneyDay } from '../src/features/today/rules';
import { LinkRow } from '../src/design/rows';

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
  useAccount: jest.fn(),
}));
// Keep Today's real order and Ask rows; other feeds own their tests.
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
function accountState(signedIn: boolean | null, checking = false) {
  jest.mocked(useAccount).mockReturnValue({
    status:
      signedIn === null
        ? null
        : {
            enabled: true,
            signedIn,
            unlimited: false,
            totalSeconds: 600,
            remainingSeconds: 600,
            activeSession: null,
            budgetOpen: null,
          },
    checking,
    error: null,
    email: null,
    cleared: false,
    notice: null,
  });
}
const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement = <AskBlock today="2026-11-13" />) {
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

beforeEach(() => {
  jest.clearAllMocks();
  mockVoiceLinked = true;
  mockTalkInAsk = true;
  jest.mocked(useWindowDimensions).mockReturnValue(standard);
  jest.mocked(readCachedEdition).mockResolvedValue(null);
  accountState(true);
});
afterEach(async () => {
  await act(async () => mounted.splice(0).forEach((r) => r.unmount()));
});

test.each([
  { signedIn: false, checking: false, signup: true },
  { signedIn: true, checking: false, signup: false },
  { signedIn: null, checking: false, signup: false },
  { signedIn: null, checking: true, signup: false },
  { signedIn: false, checking: true, signup: false },
])(
  'third Ask row routes like the composer ($signedIn, $checking)',
  async ({ signedIn, checking, signup }) => {
    accountState(signedIn, checking);
    const { root } = await render();
    const rows = root.findAllByType(LinkRow);
    expect(rows).toHaveLength(3);
    expect(rows[2]!.props).toMatchObject({
      title: 'Talk it through',
      symbol: 'waveform',
      symbolInk: 'navy',
      testID: 'today-voice',
    });
    expect(rows[2]!.props.secondary).toBeUndefined();
    expect(root.findAllByType(Button)).toHaveLength(0);
    expect(
      root.findAllByType(Icon).filter((n) => n.props.name === 'waveform')[0]!
        .props,
    ).toMatchObject({ tone: 'navy', type: 'hierarchical' });
    expect(router.push).not.toHaveBeenCalled();
    act(() => rows[2]!.props.onPress());
    expect(router.push).toHaveBeenCalledWith(
      signup ? { pathname: '/talk/sign-in' } : '/talk',
    );
  },
);

test.each([
  [false, true],
  [true, false],
  [false, false],
])(
  'Ask retains its starters when voiceLinked=%s and talkInAsk=%s',
  async (linked, flag) => {
    mockVoiceLinked = linked;
    mockTalkInAsk = flag;
    const { root } = await render();
    expect(root.findAllByType(LinkRow)).toHaveLength(2);
    expect(root.findAllByProps({ testID: 'today-voice' })).toHaveLength(0);
  },
);

test.each([1, 3.571])(
  'starter symbols are navy hierarchical at font scale %s',
  async (fontScale) => {
    jest
      .mocked(useWindowDimensions)
      .mockReturnValue({ ...standard, width: 320, fontScale });
    const { root } = await render();
    const icons = root
      .findAllByType(Icon)
      .filter((n) => n.props.name === 'text.bubble');
    expect(icons).toHaveLength(2);
    for (const icon of icons)
      expect(icon.props).toMatchObject({ tone: 'navy', type: 'hierarchical' });
  },
);

test.each(['A', 'B', 'C'] as const)(
  'Today has the voice row inside Ask in launch case %s',
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
    const ask = root.findByType(AskBlock);
    expect(ask.findAllByType(LinkRow)).toHaveLength(3);
    expect(host(root, 'today-voice')).toBeDefined();
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
