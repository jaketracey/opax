import { act, createElement } from 'react';
import TestRenderer from 'react-test-renderer';
import { Settings } from 'react-native';
import * as tour from '../src/onboarding/state';
import { e2eTourRequested } from '../src/onboarding/launch-flag';
import * as chooser from '../src/features/your-mp/chooser-request';
import {
  fadeStart,
  handoff,
  longestHandoff,
  lockup,
} from '../src/launch/timing';
import {
  finishLabel,
  pageAnnouncement,
  welcomePages,
} from '../src/onboarding/pages';

// An in-memory documents folder for the "seen" flag.
const mockFiles = new Map<string, string>();
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

// Jest has no native SettingsManager; the app reads the launch argument there.
jest.mock('react-native/Libraries/Settings/Settings', () => ({
  __esModule: true,
  default: { get: jest.fn() },
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
  (settings.get as jest.Mock).mockReset().mockReturnValue(argument);
  return { ...tour, settings };
}
const SEEN = 'documents/opax-welcome-v1.json';

beforeEach(() => {
  mockFiles.clear();
});

describe('first launch decision', () => {
  test('production and development show the tour until it is seen', () => {
    const { firstLaunchTour } = loadState(false);
    expect(firstLaunchTour({ e2e: false, requested: false, seen: false })).toBe(
      true,
    );
    expect(firstLaunchTour({ e2e: false, requested: false, seen: true })).toBe(
      false,
    );
  });
  test('e2e treats the tour as seen unless the launch argument asks', () => {
    const { firstLaunchTour } = loadState(true);
    expect(firstLaunchTour({ e2e: true, requested: false, seen: false })).toBe(
      false,
    );
    expect(firstLaunchTour({ e2e: true, requested: true, seen: false })).toBe(
      true,
    );
    // Once seen, the tour stays away after a relaunch with the argument.
    expect(firstLaunchTour({ e2e: true, requested: true, seen: true })).toBe(
      false,
    );
  });
  test('the e2e opt-in is exactly -OPAXWelcomeTour on', () => {
    const { settings } = loadState(true);
    const get = settings.get as jest.Mock;
    get.mockReturnValue('on');
    expect(e2eTourRequested()).toBe(true);
    expect(get).toHaveBeenCalledWith('OPAXWelcomeTour');
    get.mockReturnValue('off');
    expect(e2eTourRequested()).toBe(false);
    get.mockReturnValue(undefined);
    expect(e2eTourRequested()).toBe(false);
    get.mockImplementation(() => {
      throw new Error('no settings module');
    });
    expect(e2eTourRequested()).toBe(false);
  });
});

describe('seen flag', () => {
  test('is absent on a fresh install and saved by leaving the tour', async () => {
    const state = loadState(false);
    expect(await state.tourSeen()).toBe(false);
    await state.leaveTour();
    expect(JSON.parse(mockFiles.get(SEEN)!)).toEqual({ version: 1 });
    expect(await state.tourSeen()).toBe(true);
    // The temporary file is moved into place, not left behind.
    expect([...mockFiles.keys()]).toEqual([SEEN]);
  });
  test('a later tour version shows again; an unreadable flag counts as seen', async () => {
    const state = loadState(false);
    mockFiles.set(SEEN, JSON.stringify({ version: 0 }));
    expect(await state.tourSeen()).toBe(false);
    mockFiles.set(SEEN, '{not json');
    expect(await state.tourSeen()).toBe(true);
  });
});

describe('tour visibility', () => {
  test('first launch in production: visible, then hidden and remembered', async () => {
    const state = loadState(false);
    expect(state.tourState()).toBe('checking');
    await state.checkFirstLaunch();
    expect(state.tourState()).toBe('visible');
    await state.leaveTour();
    state.hideTour();
    expect(state.tourState()).toBe('hidden');
    // The next launch reads the flag and stays hidden.
    const next = loadState(false);
    await next.checkFirstLaunch();
    expect(next.tourState()).toBe('hidden');
    // Replay from Account shows it again.
    next.showTour();
    expect(next.tourState()).toBe('visible');
  });
  test('e2e cleared state without the argument: hidden, so journeys are not blocked', async () => {
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
    state.showTour();
    stop();
    state.hideTour();
    expect(heard).toEqual(['visible', 'hidden', 'visible']);
  });
});

describe('seat chooser request', () => {
  test('a request made before Your MP mounts is taken on mount, once', () => {
    const open = jest.fn();
    function Probe() {
      chooser.useSeatChooserRequest(open);
      return null;
    }
    chooser.requestSeatChooser();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(createElement(Probe));
    });
    expect(open).toHaveBeenCalledTimes(1);
    act(() => chooser.requestSeatChooser());
    expect(open).toHaveBeenCalledTimes(2);
    act(() => renderer.unmount());
    chooser.requestSeatChooser();
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('launch handoff timing', () => {
  test('never longer than about 1.2 seconds', () => {
    expect(longestHandoff(false)).toBeLessThanOrEqual(1200);
    expect(longestHandoff(true)).toBeLessThanOrEqual(1200);
    expect(handoff.rule).toBeLessThanOrEqual(handoff.latestFade);
  });
  test('fades the moment the first screen is ready, with no minimum hold', () => {
    expect(fadeStart(0, false)).toBe(0);
    expect(fadeStart(400, false)).toBe(400);
    expect(fadeStart(5000, false)).toBe(handoff.latestFade);
  });
  test('Reduce Motion: a static fade the moment it is ready', () => {
    expect(fadeStart(0, true)).toBe(0);
    expect(fadeStart(300, true)).toBe(300);
  });
  test('the rule sits under the wordmark, inside the splash image', () => {
    // scripts/render-splash.swift: the wordmark's ink ends at 104.89pt.
    expect(lockup.ruleTop).toBeGreaterThan(104.89);
    expect(lockup.ruleTop).toBeLessThan(lockup.height);
    expect(lockup.ruleWidth).toBeLessThanOrEqual(lockup.width);
  });
});

describe('tour copy', () => {
  test('five pages in the agreed order, ending on the seat chooser', () => {
    expect(welcomePages.map((page) => page.id)).toEqual([
      'about',
      'your-mp',
      'profiles',
      'bills-today',
      'search',
    ]);
    expect(finishLabel).toBe('Choose your electorate');
  });
  test('plain copy: no hype, no em dashes, no exclamation marks', () => {
    for (const page of welcomePages) {
      for (const text of [page.title, page.body]) {
        expect(text).not.toMatch(/[—!]/);
        expect(text).not.toMatch(
          /\b(powerful|seamless|effortless|amazing|revolutionary|unlock|discover)\b/i,
        );
      }
      // Short sentences.
      for (const sentence of page.body.split(/(?<=\.)\s+/))
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(24);
      expect(page.title).not.toMatch(/\.$/);
    }
  });
  test('page one uses the About copy for what OPAX is', () => {
    const about = welcomePages[0]!.body;
    expect(about).toContain(
      'brings together Australian parliamentary speeches, votes, political funding and public disclosures, with links to the records behind them',
    );
    expect(about).toContain('independent and non-partisan');
    expect(about).toContain('not a government app');
    expect(welcomePages[0]!.example).toBe(false);
  });
  test('VoiceOver hears the page position first', () => {
    expect(pageAnnouncement(1)).toBe(
      `Page 2 of 5. Your MP. ${welcomePages[1]!.body}`,
    );
  });
});
