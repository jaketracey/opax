import type { ReactNode } from 'react';
import type TestRendererType from 'react-test-renderer';
import type { Chat } from '../src/features/ask/model';

// Talk, sign-in, deletion and account sync appear on Android exactly when its
// OpaxVoice module is linked (src/voice/linked.ts); without it the null-module
// fallback stays. iOS offers them as before, module or not.

type Captured = {
  screens: {
    name: string;
    options?:
      | Record<string, unknown>
      | ((args: unknown) => Record<string, unknown>);
    redirect?: boolean;
  }[];
  guards: { guard: boolean; names: string[] }[];
};
const mockCaptured: Captured = { screens: [], guards: [] };
// Root chrome tests keep saved-seat reads local and independent of build services.
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => ({ status: 'none' }),
  savedSeatDirectory: () => null,
}));
jest.mock('expo-router', () => {
  const { Children, isValidElement } = jest.requireActual('react');
  function Stack({ children }: { children: ReactNode }) {
    return children;
  }
  Stack.Screen = function Screen(props: {
    name: string;
    options?: Record<string, unknown>;
  }) {
    mockCaptured.screens.push(props);
    return null;
  };
  Stack.Protected = function Protected({
    guard,
    children,
  }: {
    guard: boolean;
    children: ReactNode;
  }) {
    mockCaptured.guards.push({
      guard,
      names: Children.toArray(children)
        .filter(isValidElement)
        .map((child: { props: { name: string } }) => child.props.name),
    });
    return children;
  };
  const { createElement } = jest.requireActual('react');
  // A host element: no hooks, so no second React from this registry.
  const Link = ({ children, ...props }: { children: ReactNode }) =>
    createElement('Link', props, children);
  Link.Trigger = function Trigger({ children }: { children: ReactNode }) {
    return children;
  };
  Link.Preview = function Preview() {
    return null;
  };
  Link.Menu = function Menu() {
    return null;
  };
  Link.MenuAction = function MenuAction() {
    return null;
  };
  return {
    Stack,
    ThemeProvider: ({ children }: { children: ReactNode }) => children,
    DarkTheme: { dark: true },
    DefaultTheme: { dark: false },
    Link,
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
    useFocusEffect: jest.fn(),
    useRootNavigationState: () => ({ key: 'root' }),
    useNavigationContainerRef: () => ({
      isReady: () => false,
      addListener: () => () => {},
    }),
    useSegments: () => [],
    // Screens load inside the tests, after the shared preview patch runs.
    useIsPreview: () => false,
  };
});
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return {
    ...jest.requireActual('react-native-safe-area-context'),
    SafeAreaView: View,
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  };
});
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {
        variant: 'development',
        apiOrigin: 'https://opax.com.au',
        webOrigin: 'https://opax.com.au',
        appVersion: '1.0.0',
        appBuild: '1',
      },
    },
  },
}));
jest.mock('../src/launch/splash', () => ({
  decideLaunchSequence: jest.fn(async () => undefined),
  decideSplashPlain: jest.fn(),
  holdSplashForWelcome: jest.fn(),
}));
jest.mock('../src/launch/LaunchHandoff', () => ({
  LaunchHandoff: () => null,
  RootLaunchHandoff: () => null,
}));
jest.mock('../src/onboarding/state', () => ({
  checkFirstLaunch: jest.fn(async () => undefined),
  hideTour: jest.fn(),
  isContentLink: () => false,
  leaveTour: jest.fn(async () => undefined),
  showTour: jest.fn(),
  useTourState: () => 'hidden',
}));

type Os = 'android' | 'ios';
type NativeVoiceMock = Record<string, jest.Mock> | null;
const linkedModule = (): NativeVoiceMock => ({
  status: jest.fn(async () => {
    throw new Error('fixture: no account');
  }),
  chatRequest: jest.fn(async () => ({ ok: true, value: '{"ok":true}' })),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
});

/**
 * Loads modules as a build on `os` with or without OpaxVoice: a fresh module
 * registry whose React Native reports that platform from the first import.
 */
function asBuild<T>(os: Os, voice: NativeVoiceMock, load: () => T): T {
  let loaded!: T;
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual('react-native');
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    jest.doMock('../modules/opax-voice', () => ({
      __esModule: true,
      default: voice,
    }));
    loaded = load();
  });
  return loaded;
}
function render(os: Os, voice: NativeVoiceMock, element: () => ReactNode) {
  mockCaptured.screens = [];
  mockCaptured.guards = [];
  return asBuild(os, voice, () => {
    const { act } = jest.requireActual('react') as typeof import('react');
    const TestRenderer = jest.requireActual(
      'react-test-renderer',
    ) as typeof TestRendererType;
    let renderer!: TestRendererType.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<>{element()}</>);
    });
    return { renderer, act };
  });
}
afterEach(() => {
  jest.dontMock('../modules/opax-voice');
});

const scenarios: [string, Os, () => NativeVoiceMock, boolean][] = [
  ['Android with OpaxVoice', 'android', linkedModule, true],
  ['Android without it', 'android', () => null, false],
  ['iOS (unchanged)', 'ios', () => null, true],
];

describe.each(scenarios)('%s', (_name, os, voice, offered) => {
  test('the voice switch says whether Talk and accounts are offered', () => {
    const { voiceLinked } = asBuild(os, voice(), () =>
      jest.requireActual('../src/voice/linked'),
    );
    expect(voiceLinked).toBe(offered);
  });

  test('the interim Ask bar keeps Account and offers Talk when linked', () => {
    const items = asBuild(os, voice(), () =>
      jest.requireActual('../src/navigation/chrome').rootHeaderItems(),
    ) as { label: string; accessibilityLabel: string }[];
    expect(items.map((item) => item.label)).toEqual(
      offered
        ? os === 'ios'
          ? ['Talk', 'Account']
          : ['Account', 'Talk']
        : ['Account'],
    );
    expect(
      items.find((item) => item.label === 'Account')!.accessibilityLabel,
    ).toBe('Account');
  });

  test('the /talk route is guarded by the same switch', () => {
    const { renderer, act } = render(os, voice(), () => {
      const Layout = jest.requireActual('../src/app/_layout').default;
      return <Layout />;
    });
    expect(
      mockCaptured.screens.find((screen) => screen.name === 'talk')?.redirect,
    ).toBe(!offered);
    act(() => renderer.unmount());
  });

  test('Account and about shows the account block only when offered', () => {
    const { renderer, act } = render(os, voice(), () => {
      const { AccountScreen } = jest.requireActual(
        '../src/features/account/AccountScreen',
      );
      return <AccountScreen />;
    });
    // Unmounted before the status read settles: its update would render
    // outside this build's module registry.
    try {
      const ids = (id: string) =>
        renderer.root.findAll((node) => node.props.testID === id);
      expect(ids('account-section').length > 0).toBe(offered);
      expect(ids('account-links').length).toBeGreaterThan(0);
      expect(
        renderer.root.findAll(
          (node) =>
            typeof node.type === 'string' &&
            node.props.children === 'About OPAX',
        ).length,
      ).toBeGreaterThan(0);
    } finally {
      act(() => renderer.unmount());
    }
  });
});

describe('Android account routes', () => {
  test.each([
    ['with OpaxVoice', linkedModule, true],
    ['without it', () => null, false],
  ] as const)(
    '%s: sign-in and deletion follow the switch, on the reading header',
    (_name, voice, offered) => {
      const { renderer, act } = render('android', voice(), () => {
        const Layout = jest.requireActual('../src/app/account/_layout').default;
        return <Layout />;
      });
      expect(mockCaptured.guards).toEqual([]);
      const { AndroidReadingHeader } = asBuild('android', voice(), () =>
        jest.requireActual('../src/navigation/AndroidReadingHeader'),
      );
      for (const name of ['sign-in', 'delete']) {
        const screen = mockCaptured.screens.find((s) => s.name === name)!;
        expect(screen.redirect).toBe(!offered);
        const options =
          typeof screen.options === 'function'
            ? screen.options({ route: {} })
            : screen.options!;
        expect((options.header as () => unknown).name).toBe(
          AndroidReadingHeader.name,
        );
      }
      act(() => renderer.unmount());
    },
  );

  test('iOS declares no extra account screens', () => {
    const { renderer, act } = render('ios', null, () => {
      const Layout = jest.requireActual('../src/app/account/_layout').default;
      return <Layout />;
    });
    expect(mockCaptured.guards).toEqual([]);
    expect(mockCaptured.screens.map((s) => s.name)).toEqual(
      expect.arrayContaining([
        'index',
        'about',
        'sources/index',
        'consent',
        'sign-in',
        'sign-in/code',
        'delete',
        'delete/code',
        'coverage',
        'methods',
        'ask',
      ]),
    );
    act(() => renderer.unmount());
  });
});

describe('Ask account sync', () => {
  const chat: Chat = {
    id: 'fixture-chat-002',
    title: 'Question',
    kind: 'speech',
    speaker: 'Roster member',
    created: 1,
    updated: 10,
    thread: [
      { role: 'user', text: 'Question' },
      { role: 'answer', text: 'Answer', sources: [] },
    ],
  };

  test('Android with OpaxVoice syncs a submitted conversation as iOS does', async () => {
    const voice = linkedModule()!;
    const { syncSubmittedChat } = asBuild('android', voice, () =>
      jest.requireActual('../src/features/ask/sync'),
    );
    await syncSubmittedChat(chat, { signedIn: true });
    expect(voice.chatRequest).toHaveBeenCalledWith(
      `/api/community/chats/${chat.id}`,
      'PUT',
      expect.any(String),
    );
  });

  test('Android without it keeps the conversation on the phone', async () => {
    const { syncSubmittedChat } = asBuild('android', null, () =>
      jest.requireActual('../src/features/ask/sync'),
    );
    await expect(
      syncSubmittedChat(chat, { signedIn: true }),
    ).resolves.toBeUndefined();
  });
});
