/* eslint-disable @typescript-eslint/no-require-imports -- Native navigation is an inert host in component tests. */
import mockSafeAreaContext from 'react-native-safe-area-context/jest/mock';
import { router } from 'expo-router';
import { act } from 'react';
import { Dimensions, Platform, Text as NativeText, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  NavigationContext,
  NavigationRouteContext,
} from 'expo-router/react-navigation';
import WelcomeMinute from '../src/app/welcome/minute';
import LearnMinute from '../src/app/(tabs)/(today,your-mp,bills,search,ask)/learn/minute';
import { glossHint, resetGlossForTests } from '../src/design/gloss';
import { Section, SectionHeader } from '../src/design/layout';
import {
  dark,
  darkHighContrast,
  light,
  lightHighContrast,
} from '../src/design/palette';
import { chamberSeats, hemicycle } from '../src/features/newcomer/art';
import { MinutePage } from '../src/features/newcomer/MinutePage';
import {
  minuteCopy,
  minuteIdeas,
  welcomeAsk,
} from '../src/features/newcomer/copy';
import { isTermId } from '../src/features/learn/glossary';
import { openTerm } from '../src/features/learn/open-term';
import { minuteRoute } from '../src/features/learn/routes';
import {
  resetLearnSettingsForTests,
  setExplainTerms,
  useExplainTerms,
} from '../src/features/learn/settings';
import { installGloss } from '../src/features/newcomer/gloss-source';
import ShortWelcome from '../src/features/welcome/ShortWelcome';
import Welcome from '../src/features/welcome/Welcome';
import { firstLaunchTour, markWelcomeSeen } from '../src/onboarding/state';
import { welcomeMinuteRoute } from '../src/navigation/routes';

const mockSetOptions = jest.fn();
jest.mock('expo-router', () => {
  const React = require('react');
  const host = (name: string) =>
    Object.assign(
      (props: object): unknown => React.createElement(name, props),
      { displayName: name },
    );
  return {
    Link: Object.assign(host('Link'), {
      Trigger: host('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    Stack: { Screen: host('StackScreen'), Toolbar: host('Toolbar') },
    useIsPreview: () => false,
    useSegments: () => ['welcome'],
    useNavigation: () => ({
      getParent: () => undefined,
      getState: () => ({ routes: [] }),
      setOptions: mockSetOptions,
      addListener: () => () => undefined,
    }),
    useFocusEffect: () => undefined,
    useLocalSearchParams: () => ({}),
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  };
});
jest.mock('react-native-safe-area-context', () => mockSafeAreaContext);
jest.mock('../src/onboarding/state', () => ({
  ...jest.requireActual('../src/onboarding/state'),
  closeWelcome: jest.fn(),
  markWelcomeSeen: jest.fn(async () => undefined),
}));
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/launch/splash', () => ({ releaseSplash: jest.fn() }));
jest.mock('../src/launch/LaunchHandoff', () => ({
  LaunchHandoff: () => null,
}));
jest.mock('../src/features/learn/open-term', () => ({ openTerm: jest.fn() }));
const mockSeat: { current: { status: string } } = {
  current: { status: 'none' },
};
jest.mock('../src/features/your-mp/useSeat', () => ({
  useSeat: () => mockSeat.current,
}));

function setFontScale(fontScale: number, width = 390) {
  const window = { width, height: 844, scale: 3, fontScale };
  Dimensions.set({ window, screen: window });
}
async function render(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  return r;
}
const component = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => n.props.testID === id && typeof n.type !== 'string');
const host = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.find((n) => n.props.testID === id && typeof n.type === 'string');
const has = (r: TestRenderer.ReactTestRenderer, id: string) =>
  r.root.findAll((n) => n.props.testID === id).length > 0;
const words = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) =>
      [n.props.children]
        .flat(3)
        .filter((c) => typeof c === 'string')
        .join(''),
    )
    .join('\n');
/** The reader's "Explain terms", as a component reads it. */
function ExplainProbe() {
  const on = useExplainTerms();
  return <NativeText testID="explain-probe">{on ? 'on' : 'off'}</NativeText>;
}
const explainedIn = (r: TestRenderer.ReactTestRenderer) =>
  r.root.find(
    (n) => n.props.testID === 'explain-probe' && typeof n.type !== 'string',
  ).props.children === 'on';
/** A pushed page in a stack whose options the test can read. */
const mockNavigation = {
  setOptions: mockSetOptions,
  getState: () => ({ index: 1, routes: [{ key: 'w' }, { key: 'minute' }] }),
  addListener: () => () => undefined,
  isFocused: () => true,
};
function InStack({ children }: { children: React.ReactNode }) {
  return (
    <NavigationContext.Provider value={mockNavigation as never}>
      <NavigationRouteContext.Provider
        value={{ key: 'minute', name: 'minute' } as never}
      >
        {children}
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );
}
/** The bar's items, as the page last set them. */
const barItems = () => {
  const options = mockSetOptions.mock.calls
    .map(([o]) => o as { unstable_headerRightItems?: () => unknown[] })
    .filter((o) => o?.unstable_headerRightItems)
    .pop();
  return (options?.unstable_headerRightItems?.() ?? []) as {
    label: string;
    accessibilityLabel?: string;
    onPress: () => void;
  }[];
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSeat.current = { status: 'none' };
  setFontScale(1);
  // A read settings file with nothing set: the defaults (Explain terms off).
  resetLearnSettingsForTests({});
  resetGlossForTests();
});

describe('the welcome asks once (option C)', () => {
  test('the question sits over its two answers, in the agreed words, after the notice', async () => {
    const r = await render(<Welcome />);
    expect(component(r, 'welcome-ask').props.children).toBe(
      'New to how Parliament works? The basics take about a minute.',
    );
    expect(component(r, 'welcome-continue').props.label).toBe(
      'Show me the basics',
    );
    expect(component(r, 'welcome-know').props.label).toBe(
      'I know how Parliament works',
    );
    expect(component(r, 'welcome-continue').props.variant).toBe('primary');
    expect(component(r, 'welcome-know').props.variant).toBe('plain');
    // Plain rows for everyone; "Machine-written" as the app labels it.
    expect(words(r)).toContain('Who speaks for you');
    expect(words(r)).toContain('Machine-written text is always labelled.');
    expect(words(r)).not.toMatch(/computer-written/i);
    await act(async () => r.unmount());
  });
  test('"Show me the basics" stores Explain terms on and opens Parliament in a minute', async () => {
    const r = await render(
      <View>
        <Welcome />
        <ExplainProbe />
      </View>,
    );
    expect(explainedIn(r)).toBe(false);
    await act(async () => component(r, 'welcome-continue').props.onPress());
    expect(explainedIn(r)).toBe(true);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(welcomeMinuteRoute);
    expect(welcomeMinuteRoute).toEqual({ pathname: '/welcome/minute' });
    expect(markWelcomeSeen).toHaveBeenCalledWith();
    await act(async () => r.unmount());
  });
  test('"I know how Parliament works" stores Explain terms off and goes straight to the electorate step', async () => {
    await act(async () => setExplainTerms(true));
    const r = await render(
      <View>
        <Welcome />
        <ExplainProbe />
      </View>,
    );
    expect(explainedIn(r)).toBe(true);
    await act(async () => component(r, 'welcome-know').props.onPress());
    expect(explainedIn(r)).toBe(false);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    expect(markWelcomeSeen).toHaveBeenCalledWith();
    await act(async () => r.unmount());
  });
  test('one answer per visit: a second tap on either pushes nothing more', async () => {
    const r = await render(<Welcome />);
    act(() => {
      component(r, 'welcome-continue').props.onPress();
      component(r, 'welcome-know').props.onPress();
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    await act(async () => r.unmount());
  });
  test('"Not now" answers nothing: Explain terms stays off', async () => {
    const r = await render(
      <View>
        <Welcome />
        <ExplainProbe />
      </View>,
    );
    act(() => host(r, 'welcome-screen').props.onAccessibilityEscape());
    expect(markWelcomeSeen).toHaveBeenCalledWith({ declined: true });
    expect(explainedIn(r)).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    await act(async () => r.unmount());
  });
  test('the short welcome over a link asks nothing: Continue only', async () => {
    const r = await render(<ShortWelcome />);
    expect(has(r, 'welcome-ask')).toBe(false);
    expect(has(r, 'welcome-know')).toBe(false);
    expect(component(r, 'welcome-continue').props.label).toBe('Continue');
    await act(async () => r.unmount());
  });
  test('at AX5 the question and both answers scroll in after the cultural notice', async () => {
    setFontScale(3.12);
    const r = await render(<Welcome />);
    const order = host(r, 'welcome-scroll')
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          [
            'welcome-notice',
            'welcome-ask',
            'welcome-continue',
            'welcome-know',
          ].includes(n.props.testID),
      )
      .map((n) => n.props.testID as string);
    expect([...new Set(order)]).toEqual([
      'welcome-notice',
      'welcome-ask',
      'welcome-continue',
      'welcome-know',
    ]);
    await act(async () => r.unmount());
  });
});

describe('existing installs', () => {
  test('never see the question, read Explain terms off, and draw no plain lines', async () => {
    // An install that has seen the welcome (1.0 tour or the welcome) is
    // never shown it again on launch, so it never answers.
    expect(firstLaunchTour({ e2e: false, requested: false, seen: true })).toBe(
      false,
    );
    installGloss();
    const r = await render(
      <View>
        <ExplainProbe />
        <SectionHeader title="How parliament voted" gloss="division" />
      </View>,
    );
    expect(explainedIn(r)).toBe(false);
    expect(has(r, 'gloss-division')).toBe(false);
    await act(async () => r.unmount());
  });
});

describe('plain lines under headings', () => {
  test('off by default: a heading with a gloss draws exactly what it drew before', async () => {
    const plain = await render(<SectionHeader title="Bills" />);
    const glossed = await render(<SectionHeader title="Bills" gloss="bill" />);
    expect(JSON.stringify(glossed.toJSON())).toBe(
      JSON.stringify(plain.toJSON()),
    );
    await act(async () => plain.unmount());
    await act(async () => glossed.unmount());
  });
  test('with Explain terms on, the guide’s line sits under the heading and opens the full answer', async () => {
    installGloss();
    await act(async () => setExplainTerms(true));
    const r = await render(
      <Section title="Voting record" gloss="division" headingTestID="h">
        <NativeText>rows</NativeText>
      </Section>,
    );
    const line = host(r, 'gloss-division');
    expect(line.props.accessibilityRole).toBe('button');
    expect(line.props.accessibilityLabel).toBe(
      'Division. A formal vote in Parliament where each member’s name and vote is recorded.',
    );
    expect(line.props.accessibilityHint).toBe(glossHint);
    expect(words(r)).toContain('Division.');
    expect(words(r)).toContain(
      'A formal vote in Parliament where each member’s name and vote is recorded.',
    );
    // After the heading, before the section's content.
    const ids = r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['h', 'gloss-division'].includes(n.props.testID),
      )
      .map((n) => n.props.testID as string);
    expect([...new Set(ids)]).toEqual(['h', 'gloss-division']);
    act(() => component(r, 'gloss-division').props.onPress());
    expect(openTerm).toHaveBeenCalledWith('division');
    // Turned off (Account, or "I know how Parliament works"), it goes.
    await act(async () => setExplainTerms(false));
    expect(has(r, 'gloss-division')).toBe(false);
    await act(async () => r.unmount());
  });
  test('an id the glossary does not hold draws nothing', async () => {
    installGloss();
    await act(async () => setExplainTerms(true));
    const r = await render(<SectionHeader title="X" gloss="no-such-term" />);
    expect(has(r, 'gloss-no-such-term')).toBe(false);
    await act(async () => r.unmount());
  });
  test('every heading id the app passes is a glossary term', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    const files = [
      'features/today/VotesBlock.tsx',
      'features/today/BillFeed.tsx',
      'features/today/DeclarationRow.tsx',
      'features/Person.tsx',
      'features/bills/BillDetail.tsx',
    ];
    const ids = files.flatMap((file) =>
      [
        ...readFileSync(join(__dirname, '../src', file), 'utf8').matchAll(
          /gloss="([a-z-]+)"/g,
        ),
      ].map((m) => m[1]!),
    );
    expect(new Set(ids)).toEqual(
      new Set(['division', 'bill', 'register-of-interests']),
    );
    for (const id of [...ids, ...minuteCopy.further.map((f) => f.term)])
      expect(isTermId(id)).toBe(true);
  });
});

describe('Parliament in a minute', () => {
  test('in the welcome: four ideas as headings, Skip in the bar, Find my electorate at the end', async () => {
    const r = await render(
      <InStack>
        <WelcomeMinute />
      </InStack>,
    );
    expect(component(r, 'minute-title').props.children).toBe(
      'Parliament in a minute',
    );
    expect(words(r)).toContain(minuteCopy.lead);
    for (const idea of minuteIdeas) {
      const heading = component(r, `minute-idea-${idea.id}-title`);
      expect(heading.props.children).toBe(idea.title);
      for (const sentence of idea.body) expect(words(r)).toContain(sentence);
    }
    expect(minuteIdeas.map((i) => i.title)).toEqual([
      'You have an MP',
      'Parliament has two rooms',
      'They vote for you',
      'OPAX shows you the record',
    ]);
    expect(words(r)).toContain(
      'There’s more in “How Parliament works”, any time, from Today.',
    );
    const find = component(r, 'minute-find');
    expect(find.props.label).toBe('Find my electorate');
    act(() => find.props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    const [skip] = barItems();
    expect(skip?.label).toBe('Skip');
    expect(skip?.accessibilityLabel).toBe('Skip the basics');
    await act(async () => r.unmount());
  });
  test('Skip goes straight on to the electorate step', async () => {
    const r = await render(
      <InStack>
        <WelcomeMinute />
      </InStack>,
    );
    act(() => barItems()[0]!.onPress());
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    await act(async () => r.unmount());
  });
  test('a replay with a seat saved says Continue, not Find my electorate', async () => {
    mockSeat.current = { status: 'chosen' };
    const r = await render(
      <InStack>
        <WelcomeMinute />
      </InStack>,
    );
    expect(component(r, 'minute-find').props.label).toBe('Continue');
    await act(async () => r.unmount());
  });
  test('as an ordinary page (/learn/minute): no Skip and no electorate button', async () => {
    expect(minuteRoute).toEqual({ pathname: '/learn/minute' });
    const r = await render(
      <InStack>
        <LearnMinute />
      </InStack>,
    );
    expect(has(r, 'minute-screen')).toBe(true);
    expect(has(r, 'minute-find')).toBe(false);
    expect(barItems()).toEqual([]);
    expect(words(r)).toContain(minuteCopy.more);
    await act(async () => r.unmount());
  });
  test('the more answers open the guide’s terms', async () => {
    const r = await render(
      <InStack>
        <LearnMinute />
      </InStack>,
    );
    for (const { term, label } of minuteCopy.further) {
      const button = component(r, `minute-more-${term}`);
      expect(button.props.label).toBe(label);
      expect(button.props.accessibilityHint).toBe('Opens the full answer');
      act(() => button.props.onPress());
      expect(openTerm).toHaveBeenLastCalledWith(term);
    }
    await act(async () => r.unmount());
  });
  test('drawings and numbers are hidden from VoiceOver; the words carry them', async () => {
    const r = await render(
      <InStack>
        <MinutePage mode="guide" />
      </InStack>,
    );
    for (const id of [
      'minute-art-electorate',
      'minute-art-chambers',
      'minute-art-division',
      'minute-art-record',
    ]) {
      const art = host(r, id);
      expect(art.props.accessibilityElementsHidden).toBe(true);
      expect(art.props.importantForAccessibility).toBe('no-hide-descendants');
    }
    // The vote is a picture, not a real division: no figures in its captions.
    expect(words(r)).toContain('Said yes (the ayes)');
    expect(words(r)).not.toMatch(/\b82\b|\b54\b/);
    await act(async () => r.unmount());
  });
  test('at AX5 the chambers stack and the number badge grows with its digit', async () => {
    setFontScale(3.12);
    const r = await render(
      <InStack>
        <MinutePage mode="guide" />
      </InStack>,
    );
    const chambers = host(r, 'minute-art-chambers');
    const style = Object.assign(
      {},
      ...[chambers.props.style].flat(3).filter(Boolean),
    );
    expect(style.flexDirection).toBe('column');
    const badge = r.root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          n.props.accessibilityElementsHidden === true &&
          [n.props.style]
            .flat(3)
            .some((s: { minWidth?: number } | null) => s?.minWidth === 28),
      )
      .map((n) => Object.assign({}, ...[n.props.style].flat(3)));
    expect(badge.length).toBeGreaterThan(0);
    for (const b of badge) {
      expect(b.width).toBeUndefined();
      expect(b.height).toBeUndefined();
    }
    await act(async () => r.unmount());
  });
  test('the chambers draw the real seats: 150 in the House, 76 in the Senate', () => {
    expect(chamberSeats).toEqual({ house: 150, senate: 76, perState: 12 });
    expect(hemicycle(150, 6, 10, 4)).toHaveLength(150);
    expect(hemicycle(76, 4, 10, 4)).toHaveLength(76);
  });
});

describe('the welcome copy', () => {
  test('no straight apostrophes, em dashes or exclamation marks', () => {
    const all = [
      ...Object.values(welcomeAsk),
      ...minuteIdeas.flatMap((i) => [i.title, ...i.body]),
      minuteCopy.title,
      minuteCopy.lead,
      minuteCopy.more,
      ...minuteCopy.further.map((f) => f.label),
    ];
    for (const text of all) {
      expect(text).not.toMatch(/[—–!']/);
    }
  });
});

describe('chamber colours', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  };
  test('their own two roles, not money or danger, AA on every ground in all four themes', () => {
    const themes = [
      light,
      dark,
      { ...light, ...lightHighContrast },
      { ...dark, ...darkHighContrast },
    ];
    for (const theme of themes) {
      for (const role of ['houseInk', 'senateInk'] as const) {
        expect(theme[role]).toMatch(/^#[0-9A-F]{6}$/);
        for (const ground of ['paper', 'raised', 'sunken'] as const)
          expect(ratio(theme[role], theme[ground])).toBeGreaterThanOrEqual(4.5);
      }
      expect(theme.houseInk).not.toBe(theme.moneyInk);
      expect(theme.senateInk).not.toBe(theme.danger);
    }
  });
});

describe('Android (JS level: no emulator on the Mac)', () => {
  const os = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
  beforeEach(() =>
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    }),
  );
  afterEach(() => Object.defineProperty(Platform, 'OS', os));
  test('the welcome asks the same question, and either answer moves on', async () => {
    const r = await render(<Welcome />);
    expect(component(r, 'welcome-continue').props.label).toBe(
      welcomeAsk.basics,
    );
    act(() => component(r, 'welcome-know').props.onPress());
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/welcome/seat',
      params: {},
    });
    await act(async () => r.unmount());
  });
  test('Skip sits in the Android bar as a header button', async () => {
    const r = await render(
      <InStack>
        <WelcomeMinute />
      </InStack>,
    );
    const options = mockSetOptions.mock.calls
      .map(([o]) => o as { headerRight?: () => unknown })
      .filter((o) => o?.headerRight)
      .pop();
    expect(options?.headerRight).toEqual(expect.any(Function));
    expect(barItems()[0]?.label).toBe('Skip');
    await act(async () => r.unmount());
  });
  test('the plain line is a button that opens the term', async () => {
    installGloss();
    await act(async () => setExplainTerms(true));
    const r = await render(<SectionHeader title="Bills" gloss="bill" />);
    const line = component(r, 'gloss-bill');
    expect(line.props.accessibilityRole).toBe('button');
    act(() => line.props.onPress());
    expect(openTerm).toHaveBeenCalledWith('bill');
    await act(async () => r.unmount());
  });
});
