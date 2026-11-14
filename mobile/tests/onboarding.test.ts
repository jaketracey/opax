import { Settings } from 'react-native';
import * as tour from '../src/onboarding/state';
import { e2eTourRequested } from '../src/onboarding/launch-flag';
import { fadeStart, handoff, longestHandoff } from '../src/launch/timing';
import * as splash from '../src/launch/splash';
import { welcomeCopy } from '../src/features/welcome/copy';
import { invitationPlace } from '../src/features/today/order';

// An in-memory documents folder for the "seen" flag.
const mockFiles = new Map<string, string>();
const mockWelcomeDismissed = jest.fn();
jest.mock('../src/launch/settled', () => ({
  welcomeDismissed: () => mockWelcomeDismissed(),
}));
jest.mock('expo-file-system', () => {
  class File {
    path: string;
    constructor(directory: string, name: string) {
      this.path = `${directory}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.path);
    }
    async text() {
      return mockFiles.get(this.path)!;
    }
    write(text: string) {
      mockFiles.set(this.path, text);
    }
    move(to: { path: string }) {
      mockFiles.set(to.path, mockFiles.get(this.path)!);
      mockFiles.delete(this.path);
    }
  }
  return { File, Paths: { document: 'documents' } };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hide: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useIsPreview: () => false,
  router: { push: jest.fn(), back: jest.fn() },
}));

// Jest has no native SettingsManager; the app reads the launch argument there.
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: jest.fn(), set: jest.fn() },
}));
let mockE2E = false;
jest.mock('../src/design/environment', () => ({
  get isE2E() {
    return mockE2E;
  },
}));
/** The state module as a fresh launch of one build variant sees it. */
function loadState(e2e: boolean, argument?: string) {
  mockE2E = e2e;
  tour.resetTourForTests();
  const settings = Settings;
  (settings.get as jest.Mock)
    .mockReset()
    .mockImplementation((key: string) =>
      key === 'OPAXWelcomeTour' ? argument : undefined,
    );
  (settings.set as jest.Mock).mockReset();
  return { ...tour, settings };
}
const SEEN = 'documents/opax-welcome-v1.json';

beforeEach(() => {
  mockFiles.clear();
});

describe('first launch decision', () => {
  test('production and development show the welcome until it is seen', () => {
    const { firstLaunchTour } = loadState(false);
    expect(firstLaunchTour({ e2e: false, requested: false, seen: false })).toBe(
      true,
    );
    expect(firstLaunchTour({ e2e: false, requested: false, seen: true })).toBe(
      false,
    );
  });
  test('e2e treats the welcome as seen unless the launch argument asks', () => {
    const { firstLaunchTour } = loadState(true);
    expect(firstLaunchTour({ e2e: true, requested: false, seen: false })).toBe(
      false,
    );
    expect(firstLaunchTour({ e2e: true, requested: true, seen: false })).toBe(
      true,
    );
    expect(firstLaunchTour({ e2e: true, requested: true, seen: true })).toBe(
      false,
    );
  });
  test('the e2e opt-in is -OPAXWelcomeTour on or -OPAXWelcome on, kept for a link launch', () => {
    const { settings } = loadState(true);
    const get = settings.get as jest.Mock;
    const set = settings.set as jest.Mock;
    const store: Record<string, unknown> = {};
    get.mockImplementation((key: string) => store[key]);
    set.mockImplementation((values: Record<string, unknown>) =>
      Object.assign(store, values),
    );
    expect(e2eTourRequested()).toBe(false);
    store.OPAXWelcome = 'on';
    expect(e2eTourRequested()).toBe(true);
    expect(set).toHaveBeenCalledWith({ OPAXWelcomeTourKept: 'on' });
    // A later launch from a link carries no arguments: the kept value answers.
    delete store.OPAXWelcome;
    expect(e2eTourRequested()).toBe(true);
    store.OPAXWelcomeTourKept = undefined;
    store.OPAXWelcomeTour = 'off';
    expect(e2eTourRequested()).toBe(false);
    get.mockImplementation(() => {
      throw new Error('no settings module');
    });
    expect(e2eTourRequested()).toBe(false);
  });
});

describe('seen flag', () => {
  test('is absent on a fresh install and saved by the welcome', async () => {
    const state = loadState(false);
    expect(await state.welcomeSeen()).toBe(false);
    await state.markWelcomeSeen();
    expect(JSON.parse(mockFiles.get(SEEN)!)).toEqual({
      version: 1,
      generation: 1,
    });
    expect(await state.welcomeSeen()).toBe(true);
    expect([...mockFiles.keys()]).toEqual([SEEN]);
    expect(await state.welcomeDeclinedAt()).toBeNull();
    expect(state.welcomeDeclinedThisLaunch()).toBe(false);
  });
  test('1.0 readers who saw the tour keep their flag', async () => {
    const state = loadState(false);
    mockFiles.set(SEEN, JSON.stringify({ version: 1, generation: 1 }));
    expect(await state.welcomeSeen()).toBe(true);
    await state.checkFirstLaunch();
    expect(state.tourState()).toBe('hidden');
  });
  test('"Not now" records the Sydney day and this launch', async () => {
    const state = loadState(false);
    await state.markWelcomeSeen({ declined: true });
    expect(state.welcomeDeclinedThisLaunch()).toBe(true);
    expect(await state.welcomeDeclinedAt()).toBe(state.sydneyDate());
    // A later seen (a replay that chose a seat) keeps the day.
    const next = loadState(false);
    await next.markWelcomeSeen();
    expect(await next.welcomeDeclinedAt()).toBe(next.sydneyDate());
    expect(next.welcomeDeclinedThisLaunch()).toBe(false);
  });
  test('the day is counted in Sydney', () => {
    const { sydneyDate } = loadState(false);
    // 14:30 UTC on 9 November is 01:30 on 10 November in Sydney (AEDT).
    expect(sydneyDate(new Date('2026-11-09T14:30:00Z'))).toBe('2026-11-10');
    expect(sydneyDate(new Date('2026-06-30T13:59:00Z'))).toBe('2026-06-30');
  });
  test('a later version shows again; an unreadable flag counts as seen', async () => {
    const state = loadState(false);
    mockFiles.set(SEEN, JSON.stringify({ version: 0 }));
    expect(await state.welcomeSeen()).toBe(false);
    mockFiles.set(SEEN, '{not json');
    expect(await state.welcomeSeen()).toBe(true);
  });
});

describe('welcome visibility', () => {
  test('first launch in production: due, then spent and remembered', async () => {
    const state = loadState(false);
    expect(state.tourState()).toBe('checking');
    await state.checkFirstLaunch();
    expect(state.tourState()).toBe('visible');
    state.hideTour();
    await state.markWelcomeSeen();
    expect(state.tourState()).toBe('hidden');
    const next = loadState(false);
    await next.checkFirstLaunch();
    expect(next.tourState()).toBe('hidden');
  });
  test('e2e cleared state without the argument: not due, so journeys are not blocked', async () => {
    const state = loadState(true);
    await state.checkFirstLaunch();
    expect(state.tourState()).toBe('hidden');
  });
  test('e2e with -OPAXWelcomeTour on behaves like production', async () => {
    const state = loadState(true, 'on');
    await state.checkFirstLaunch();
    expect(state.tourState()).toBe('visible');
  });
  test('subscribers hear every change once', async () => {
    const state = loadState(false);
    const heard: string[] = [];
    const stop = state.subscribeTour(() => heard.push(state.tourState()));
    await state.checkFirstLaunch();
    state.hideTour();
    state.hideTour();
    stop();
    expect(heard).toEqual(['visible', 'hidden']);
  });
  test('closing the welcome pops the whole modal from the root stack', () => {
    const { closeWelcome } = loadState(false);
    const goBack = jest.fn();
    mockWelcomeDismissed.mockClear();
    closeWelcome({ getParent: () => ({ goBack }) });
    expect(goBack).toHaveBeenCalledTimes(1);
    // The reader is about to see Today: the launch may settle
    // (launch/settled.ts; the timing is in launch-splash.test.tsx).
    expect(mockWelcomeDismissed).toHaveBeenCalledTimes(1);
  });
});

// First-run drop-off (12 Nov): what the next cold launch shows after the app
// is closed at each step. The welcome's own calls are in welcome.test.tsx
// and first-run-drop.test.tsx; these hold what the device remembers.
describe('relaunch during first run', () => {
  /** A cold launch: is the welcome due, and where does Today's invitation sit? */
  async function relaunch() {
    const state = loadState(false);
    await state.checkFirstLaunch();
    const welcomeDeclinedAt = await state.welcomeDeclinedAt();
    return {
      welcome: state.tourState() === 'visible',
      declinedThisLaunch: state.welcomeDeclinedThisLaunch(),
      invitation: invitationPlace(
        { hiddenUntil: null, welcomeDeclinedAt },
        state.sydneyDate(),
      ),
    };
  }
  test('closed on the welcome page, before Continue: the welcome shows again', async () => {
    const first = loadState(false);
    await first.checkFirstLaunch();
    expect(first.tourState()).toBe('visible');
    first.hideTour();
    // Nothing tapped, nothing written.
    expect([...mockFiles.keys()]).toEqual([]);
    expect(await relaunch()).toEqual({
      welcome: true,
      declinedThisLaunch: false,
      invitation: 'lead',
    });
  });
  test('closed on the electorate step or a Browse list, after Continue: Today, with the invitation in its own slot', async () => {
    const first = loadState(false);
    await first.checkFirstLaunch();
    first.hideTour();
    // Continue (Welcome.tsx): seen, nothing declined.
    await first.markWelcomeSeen();
    expect(await relaunch()).toEqual({
      welcome: false,
      declinedThisLaunch: false,
      invitation: 'lead',
    });
  });
  test('after "Choose later" or "Not now": Today, the invitation after Bills', async () => {
    const first = loadState(false);
    await first.checkFirstLaunch();
    first.hideTour();
    await first.markWelcomeSeen();
    await first.markWelcomeSeen({ declined: true });
    expect(first.welcomeDeclinedThisLaunch()).toBe(true);
    expect(await relaunch()).toEqual({
      welcome: false,
      declinedThisLaunch: false,
      invitation: 'after-bills',
    });
  });
  test('after choosing a seat: Today, and nothing was declined', async () => {
    const first = loadState(false);
    await first.checkFirstLaunch();
    first.hideTour();
    await first.markWelcomeSeen();
    await first.markWelcomeSeen({ declined: false });
    expect(await first.welcomeDeclinedAt()).toBeNull();
    expect((await relaunch()).welcome).toBe(false);
  });
  test('Continue and "Not now" written back to back still keep the decline', async () => {
    const first = loadState(false);
    await Promise.all([
      first.markWelcomeSeen(),
      first.markWelcomeSeen({ declined: true }),
    ]);
    expect(await first.welcomeDeclinedAt()).toBe(first.sydneyDate());
    expect(await first.welcomeSeen()).toBe(true);
  });
  test('a 1.0 reader and an e2e launch are unchanged: no welcome', async () => {
    mockFiles.set(SEEN, JSON.stringify({ version: 1, generation: 1 }));
    expect((await relaunch()).welcome).toBe(false);
    mockFiles.clear();
    const e2e = loadState(true);
    await e2e.checkFirstLaunch();
    expect(e2e.tourState()).toBe('hidden');
  });
});

describe('content links', () => {
  test('a link to a page shows the short welcome', () => {
    const { isContentLink } = loadState(false);
    expect(isContentLink('opax://person/anthony-albanese')).toBe(true);
    expect(
      isContentLink('https://opax.com.au/subject/person/tony-abbott'),
    ).toBe(true);
    expect(isContentLink('opax://bills/r7270')).toBe(true);
  });
  test('Today, the bare app and a development client are plain launches', () => {
    const { isContentLink } = loadState(false);
    for (const url of [
      null,
      undefined,
      '',
      'opax://',
      'opax:///',
      'opax://today',
      'https://opax.com.au/',
      'https://opax.com.au/today/',
      'opax://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
      'not a url',
    ])
      expect(isContentLink(url)).toBe(false);
  });
});

describe('splash release', () => {
  beforeEach(() => splash.resetSplashForTests());
  test('nothing releases until the root decides', () => {
    splash.releaseSplash('today');
    expect(splash.splashPhase()).toBe('pending');
    expect(splash.splashReleased()).toBe(false);
    splash.decideSplashPlain();
    expect(splash.splashReleased()).toBe(true);
  });
  test('a returning launch fades when Today answers', () => {
    splash.decideSplashPlain();
    splash.releaseSplash('welcome');
    expect(splash.splashReleased()).toBe(false);
    splash.releaseSplash('today');
    expect(splash.splashReleased()).toBe(true);
  });
  test('the first launch waits for the welcome, never for Today', () => {
    const heard = jest.fn();
    splash.subscribeSplash(heard);
    splash.holdSplashForWelcome();
    splash.decideSplashPlain();
    expect(splash.splashPhase()).toBe('welcome');
    splash.releaseSplash('today');
    expect(splash.splashReleased()).toBe(false);
    splash.releaseSplash('welcome');
    splash.releaseSplash('welcome');
    expect(splash.splashReleased()).toBe(true);
    expect(heard).toHaveBeenCalledTimes(3);
  });
  test('the failsafe releases either way', () => {
    splash.holdSplashForWelcome();
    splash.releaseSplash('failsafe');
    expect(splash.splashReleased()).toBe(true);
  });
});

describe('launch handoff timing', () => {
  test('one 240 ms crossfade, and never longer than 1.2 seconds', () => {
    expect(handoff.fade).toBe(240);
    expect(longestHandoff(false)).toBeLessThanOrEqual(1200);
    // A Reduce Motion cut has no fade to cover a screen still settling, so
    // it waits as long as the fade would have taken: the same longest launch.
    expect(longestHandoff(true)).toBe(handoff.latestFade + handoff.fade);
    expect(longestHandoff(true)).toBe(longestHandoff(false));
  });
  test('fades the moment the first screen is ready, with no minimum hold', () => {
    expect(fadeStart(0, false)).toBe(0);
    expect(fadeStart(300, false)).toBe(300);
    expect(fadeStart(5000, false)).toBe(handoff.latestFade);
  });
  test('Reduce Motion: a cut the moment it is ready', () => {
    expect(handoff.reducedFade).toBe(0);
    expect(fadeStart(0, true)).toBe(0);
    expect(fadeStart(300, true)).toBe(300);
  });
});

describe('welcome copy', () => {
  test('three features in the agreed order', () => {
    expect(welcomeCopy.title).toBe('Welcome to OPAX');
    expect(welcomeCopy.features.map((f) => f.title)).toEqual([
      'Your MP',
      'Every figure is sourced',
      'Ask the record',
    ]);
  });
  test('plain copy: no hype, no em dashes, no exclamation marks', () => {
    for (const feature of welcomeCopy.features) {
      for (const text of [feature.title, feature.line]) {
        expect(text).not.toMatch(/[—!]/);
        expect(text).not.toMatch(
          /\b(powerful|seamless|effortless|amazing|revolutionary|unlock|discover)\b/i,
        );
      }
      expect(feature.title).not.toMatch(/\.$/);
    }
  });
});
