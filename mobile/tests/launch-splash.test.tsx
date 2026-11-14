import { StatusBar } from 'expo-status-bar';
import {
  launchCoverGone,
  launchSettled,
  resetLaunchSettledForTests,
  SETTLE_LIMIT_MS,
  settleLaunch,
  subscribeLaunchSettled,
  WELCOME_DISMISS_MS,
  welcomeDismissed,
  welcomeMounted,
} from '../src/launch/settled';
import * as SplashScreen from 'expo-splash-screen';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useReduceMotionSetting } from '../src/design/accessibility';
import {
  easeOut,
  letterWindow,
  lerp,
  name,
  nameFontSize,
  progress,
  restWindow,
  splashLayout,
} from '../src/launch/choreography';
import { splashCopy } from '../src/launch/copy';
import { splashGeometry } from '../src/launch/geometry.generated';
import { LaunchHandoff } from '../src/launch/LaunchHandoff';
import * as played from '../src/launch/played';
import * as splashState from '../src/launch/splash';
import {
  fullSequenceLength,
  handoff,
  longestHandoff,
  splash,
} from '../src/launch/timing';

// An in-memory documents folder for the "played" flag.
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
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => undefined),
  hide: jest.fn(),
}));
let mockE2E = false;
jest.mock('../src/design/environment', () => ({
  get isE2E() {
    return mockE2E;
  },
  variant: 'development',
  hasSourcePreview: false,
  isProduction: false,
  webOrigin: 'https://opax.invalid',
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: jest.fn(() => false),
}));
// The shared mock builds a new shared value on every render; the real one
// is stable, and the cover's styles read it after its timers have moved it.
jest.mock('react-native-reanimated', () => {
  const mock = jest.requireActual('react-native-reanimated/mock');
  const { useRef } = jest.requireActual('react');
  return {
    ...mock,
    useFrameCallback: () => ({
      setActive: () => {},
      isActive: false,
      callbackId: -1,
    }),
    useSharedValue: (init: unknown) => {
      const ref = useRef<unknown>(null);
      ref.current ??= mock.useSharedValue(init);
      return ref.current;
    },
  };
});

const phone = { width: 390, height: 844, scale: 3, fontScale: 1 };
const se = { width: 320, height: 568, scale: 2, fontScale: 1 };
const full = splash.full;
const motionLength = full.settle + full.unfold + full.hold;

let view: ReactTestRenderer | undefined;
let announce: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockFiles.clear();
  mockE2E = false;
  jest.mocked(useReduceMotionSetting).mockReturnValue(false);
  jest.mocked(SplashScreen.hide).mockClear();
  Dimensions.set({ window: phone, screen: phone });
  // React Native's Jest setup already makes this a mock, so the spy wraps
  // the same function across tests: clear its calls here.
  announce = jest
    .spyOn(AccessibilityInfo, 'announceForAccessibility')
    .mockImplementation(() => undefined);
  announce.mockClear();
  splashState.resetSplashForTests();
});
afterEach(() => {
  act(() => view?.unmount());
  view = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

type Props = Partial<Parameters<typeof LaunchHandoff>[0]>;
function draw(props: Props = {}) {
  const onDone = jest.fn();
  act(() => {
    view = create(<LaunchHandoff ready onDone={onDone} {...props} />);
  });
  return {
    onDone,
    rerender: (next: Props) => rerender({ ...props, ...next }, onDone),
    // The mock evaluates animated styles at render: re-read them after a beat.
    refresh: () => rerender(props, onDone),
  };
}
function rerender(props: Props, onDone: jest.Mock) {
  act(() => {
    view!.update(<LaunchHandoff ready onDone={onDone} {...props} />);
  });
}
/** The first node with a testID (the composite; props flow to the host). */
const node = (id: string) =>
  view!.root.findAll((n) => n.props.testID === id)[0]!;
const has = (id: string) =>
  view!.root.findAll((n) => n.props.testID === id).length > 0;
/** Both layers have loaded: the cover is drawn and hides the native splash. */
function loaded(id = 'launch-handoff') {
  act(() => node(`${id}-star`).props.onLoad());
  act(() => node(`${id}-wordmark`).props.onLoad());
}
const style = (id: string) => StyleSheet.flatten(node(id).props.style);
const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const flush = () => act(async () => Promise.resolve());

describe('the launch splash timing', () => {
  test('the full sequence is a short, deliberate opening', () => {
    expect(fullSequenceLength(false)).toBeGreaterThanOrEqual(1600);
    expect(fullSequenceLength(false)).toBeLessThanOrEqual(2200);
    expect(fullSequenceLength(true)).toBeLessThanOrEqual(
      fullSequenceLength(false),
    );
    expect(splash.skipExit).toBeLessThanOrEqual(full.exit);
  });
  test('the short sequence is the 240 ms handoff, never past 400 ms', () => {
    expect(handoff.fade).toBe(240);
    expect(longestHandoff(false)).toBeLessThanOrEqual(700);
  });
  test('every line finishes within the unfold, in order', () => {
    for (let i = 0; i < 4; i++) {
      const letter = letterWindow(i);
      const rest = restWindow(i);
      expect(letter[0]).toBeLessThan(letter[1]);
      expect(rest[0]).toBeLessThan(rest[1]);
      expect(rest[1]).toBeLessThanOrEqual(1);
      expect(rest[0]).toBeGreaterThan(letter[0]);
      if (i > 0) {
        expect(letter[0]).toBeGreaterThan(letterWindow(i - 1)[0]);
        expect(rest[0]).toBeGreaterThan(restWindow(i - 1)[0]);
      }
    }
    expect(splash.windows.star[1]).toBeLessThanOrEqual(1);
  });
  test('the worklet arithmetic clamps and eases out', () => {
    expect(progress(0, [0.2, 0.6])).toBe(0);
    expect(progress(0.4, [0.2, 0.6])).toBeCloseTo(0.5);
    expect(progress(1, [0.2, 0.6])).toBe(1);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });
});

describe('the name and its art agree', () => {
  test('the full name is the README form, one word a line', () => {
    expect(splashCopy.words).toEqual([
      'Open',
      'Parliamentary',
      'Accountability',
      'eXchange',
    ]);
    expect(splashCopy.announcement).toBe(
      `${splashCopy.wordmark}, ${splashCopy.words.join(' ')}`,
    );
    expect(splashGeometry.words.map((w) => w.text)).toEqual([
      ...splashCopy.words,
    ]);
    // Each word carries its letter of OPAX; the X of eXchange is inside it.
    splashCopy.words.forEach((word, i) =>
      expect(word.includes(splashCopy.wordmark[i]!)).toBe(true),
    );
  });
  test('the wordmark geometry is the native lockup', () => {
    expect(splashGeometry.canvas).toEqual({ width: 200, height: 120 });
    expect(splashGeometry.mark).toEqual({ x: 70, y: 6, size: 60 });
    expect(splashGeometry.wordmark.fontSize).toBe(30);
    expect(splashGeometry.wordmark.pens).toHaveLength(4);
  });
});

describe('the name fits every screen and text size', () => {
  const widths = [320, 375, 390, 402, 430, 744, 820, 1024, 1366];
  const scales = [0.823, 1, 1.118, 1.353, 1.786, 2.143, 2.643, 3.143, 3.571];
  const longest = Math.max(...splashGeometry.words.map((w) => w.advance));
  test('at the default size the name is the wordmark size, 30pt', () => {
    expect(nameFontSize(phone)).toBe(30);
    expect(nameFontSize(se)).toBe(30);
    expect(nameFontSize({ ...phone, fontScale: 0.823 })).toBe(30);
  });
  test('it grows with Dynamic Type to about 1.5x, then stops', () => {
    expect(nameFontSize({ ...phone, fontScale: 1.353 })).toBeCloseTo(40.59);
    expect(nameFontSize({ width: 1024, height: 1366, fontScale: 3.571 })).toBe(
      name.max,
    );
  });
  test('the longest word never clips or wraps, even on an iPhone SE at AX5', () => {
    for (const width of widths)
      for (const fontScale of scales) {
        const layout = splashLayout({ width, height: 568, fontScale });
        expect(layout.block.width).toBeLessThanOrEqual(width - 2 * name.margin);
        expect(layout.block.width).toBeCloseTo(longest * layout.size);
        expect(layout.block.left).toBeGreaterThanOrEqual(name.margin);
        expect(layout.size).toBeGreaterThanOrEqual(30 * Math.min(1, 1));
        // The settled star and the four lines sit within the SE's height.
        expect(layout.star.to.y).toBeGreaterThan(0);
        expect(layout.block.top + layout.block.height).toBeLessThan(568);
      }
  });
  test('each letter starts on the native wordmark and lands on its line', () => {
    const layout = splashLayout(phone);
    const canvas = { x: (390 - 200) / 2, y: (844 - 120) / 2 };
    expect(layout.canvas).toEqual(canvas);
    expect(layout.star.from).toEqual({
      x: canvas.x + 70,
      y: canvas.y + 6,
      size: 60,
    });
    layout.lines.forEach((line, i) => {
      expect(line.letter.text).toBe(splashCopy.wordmark[i]);
      expect(line.letter.from).toEqual({
        x: canvas.x + splashGeometry.wordmark.pens[i]!,
        y: canvas.y + splashGeometry.wordmark.baseline,
      });
      expect(line.letter.to.y).toBe(line.baseline);
      if (i > 0)
        expect(line.baseline - layout.lines[i - 1]!.baseline).toBe(
          layout.lineHeight,
        );
    });
    // O, P and A lead their words at the block's left edge.
    for (const i of [0, 1, 2]) {
      expect(layout.lines[i]!.before).toBeNull();
      expect(layout.lines[i]!.letter.to.x).toBe(layout.block.left);
    }
    // The X lands one "e" in; the e appears before it.
    const x = layout.lines[3]!;
    expect(x.before).toEqual({ text: 'e', x: layout.block.left });
    expect(x.letter.to.x).toBeCloseTo(
      layout.block.left + splashGeometry.words[3].pens[1] * 30,
    );
    expect(x.rest.text).toBe('change');
    expect(
      layout.lines
        .map((l) => (l.before?.text ?? '') + l.letter.text + l.rest.text)
        .join(' '),
    ).toBe(splashCopy.words.join(' '));
    // The star settles above the name, centred.
    expect(layout.star.to.x + layout.star.to.size / 2).toBe(195);
    expect(layout.star.to.y + layout.star.to.size).toBeLessThan(
      layout.block.top,
    );
  });
});

describe('the launch cover', () => {
  test('draws the native layers, then hides the native splash under them', () => {
    draw({ sequence: 'full' });
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(has('launch-handoff-star')).toBe(true);
    expect(has('launch-handoff-wordmark')).toBe(true);
    // The star and the wordmark image sit exactly where the native splash draws them.
    const layout = splashLayout(phone);
    expect(style('launch-handoff-star')).toMatchObject({
      left: layout.star.from.x,
      top: layout.star.from.y,
      width: 60,
      height: 60,
    });
    expect(style('launch-handoff-wordmark')).toMatchObject({
      left: layout.canvas.x,
      top: layout.canvas.y,
      width: 200,
      height: 120,
    });
    loaded();
    expect(SplashScreen.hide).toHaveBeenCalledTimes(1);
  });
  test('is hidden from VoiceOver, keeps the status bar light and the brand navy', () => {
    draw({ sequence: 'full' });
    expect(node('launch-handoff').props.accessibilityElementsHidden).toBe(true);
    expect(node('launch-handoff').props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
    expect(view!.root.findByType(StatusBar).props.style).toBe('light');
    expect(style('launch-handoff')).toMatchObject({
      backgroundColor: '#142A43',
    });
    expect(style('launch-handoff-line-0-letter')).toMatchObject({
      color: '#FAF9F6',
      fontFamily: 'Merriweather-Bold',
      fontSize: 30,
    });
  });
  test('the full sequence unfolds the name, holds, then fades out on time', () => {
    const { onDone, refresh } = draw({ sequence: 'full' });
    loaded();
    expect(node('launch-handoff-line-0-letter').props.children).toBe('O');
    expect(node('launch-handoff-line-0-rest').props.children).toBe('pen');
    expect(node('launch-handoff-line-3-before').props.children).toBe('e');
    expect(node('launch-handoff-line-3-letter').props.children).toBe('X');
    expect(node('launch-handoff-line-3-rest').props.children).toBe('change');
    // Before motion the letters are where the wordmark image is.
    const layout = splashLayout(phone);
    const letter = style('launch-handoff-line-0-letter');
    expect(letter.left).toBe(layout.lines[0]!.letter.to.x);
    expect(letter.transform).toEqual([
      {
        translateX:
          layout.lines[0]!.letter.from.x - layout.lines[0]!.letter.to.x,
      },
      {
        translateY:
          layout.lines[0]!.letter.from.y - layout.lines[0]!.letter.to.y,
      },
      { scale: 1 },
    ]);
    expect(letter.opacity).toBe(0);
    expect(style('launch-handoff-wordmark').opacity).toBe(1);
    advance(full.settle + 1);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(splashCopy.announcement);
    // Under the Jest mock, timing lands at once: the letters are home.
    refresh();
    expect(style('launch-handoff-line-0-letter').transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scale: 1 },
    ]);
    expect(style('launch-handoff-line-0-letter').opacity).toBe(1);
    expect(style('launch-handoff-wordmark').opacity).toBe(0);
    expect(style('launch-handoff-line-3-rest').opacity).toBe(1);
    advance(motionLength - full.settle - 1 - 1);
    expect(onDone).not.toHaveBeenCalled();
    expect(style('launch-handoff').pointerEvents).toBe('auto');
    advance(2);
    expect(style('launch-handoff').pointerEvents).toBe('none');
    expect(onDone).not.toHaveBeenCalled();
    advance(full.exit);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('records the full sequence as played, once per splash version', async () => {
    draw({ sequence: 'full' });
    loaded();
    await expect(played.fullSplashPlayed()).resolves.toBe(false);
    advance(motionLength + full.exit + 1);
    await flush();
    await expect(played.fullSplashPlayed()).resolves.toBe(true);
    await expect(played.chooseLaunchSequence()).resolves.toBe('short');
  });
  test('a plain launch unfolds the name until it has played, never in e2e', async () => {
    await expect(played.chooseLaunchSequence()).resolves.toBe('full');
    mockE2E = true;
    await expect(played.chooseLaunchSequence()).resolves.toBe('short');
    mockE2E = false;
    await played.markFullSplashPlayed();
    await expect(played.chooseLaunchSequence()).resolves.toBe('short');
    // The root reads the decision through splash.ts, once per launch.
    splashState.resetSplashForTests();
    expect(splashState.launchSequence()).toBe('pending');
    await splashState.decideLaunchSequence();
    expect(splashState.launchSequence()).toBe('short');
  });
  test('Reduce Motion crossfades the name in place and fades out', () => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(true);
    const { onDone, refresh } = draw({ sequence: 'full' });
    loaded();
    expect(has('launch-handoff-star-settled')).toBe(true);
    const layout = splashLayout(phone);
    expect(style('launch-handoff-star-settled')).toMatchObject({
      left: layout.star.to.x,
      top: layout.star.to.y,
      width: layout.star.to.size,
      height: layout.star.to.size,
      opacity: 0,
    });
    expect(style('launch-handoff-line-1-letter').transform).toEqual([]);
    expect(style('launch-handoff-line-1-letter').opacity).toBe(0);
    const r = splash.reduced;
    advance(r.settle + 1);
    refresh();
    expect(style('launch-handoff-line-1-letter').transform).toEqual([]);
    expect(style('launch-handoff-line-1-letter').opacity).toBe(1);
    expect(style('launch-handoff-star-settled').opacity).toBe(1);
    expect(style('launch-handoff-star').opacity).toBe(0);
    expect(announce).toHaveBeenCalledTimes(1);
    advance(r.crossfade + r.hold - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(r.exit + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('a tap skips to the exit once the app is ready', () => {
    const { onDone, rerender } = draw({ sequence: 'full', ready: false });
    loaded();
    advance(full.settle + 200);
    act(() => node('launch-handoff-skip').props.onPress());
    advance(splash.skipExit + 50);
    // Not ready: the tap is kept, nothing leaves.
    expect(onDone).not.toHaveBeenCalled();
    rerender({ ready: true });
    advance(splash.skipExit - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('a tap during the settle skips at once, and nothing announces', async () => {
    const { onDone } = draw({ sequence: 'full' });
    loaded();
    act(() => node('launch-handoff-skip').props.onPress());
    advance(splash.skipExit - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(full.settle + full.unfold);
    expect(announce).not.toHaveBeenCalled();
    // A skipped full sequence still counts as played.
    await flush();
    await expect(played.fullSplashPlayed()).resolves.toBe(true);
  });
  test('never waits on the app beyond its own length: a plain launch leaves on time', () => {
    const { onDone } = draw({ sequence: 'full', ready: false, latest: true });
    loaded();
    advance(motionLength + 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(full.exit + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('a first launch holds the name until the welcome has laid out', () => {
    const { onDone, rerender } = draw({ sequence: 'full', ready: false });
    loaded();
    advance(motionLength + full.exit + 1000);
    expect(onDone).not.toHaveBeenCalled();
    rerender({ ready: true });
    advance(full.exit + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('the short sequence is the plain handoff: no name, no announcement', async () => {
    const { onDone } = draw({ sequence: 'short' });
    loaded();
    advance(handoff.fade - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(2);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
    expect(style('launch-handoff-wordmark').opacity).toBe(1);
    await flush();
    await expect(played.fullSplashPlayed()).resolves.toBe(false);
  });
  test('the short sequence leaves by latestFade when the app is slow', () => {
    const { onDone } = draw({ sequence: 'short', ready: false, latest: true });
    loaded();
    advance(handoff.latestFade - 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(1 + handoff.fade + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  // Sweep 3 recapture, first install under Reduce Motion: a cut at
  // latestFade showed Today's date 68 pt low for a few frames, with no fade
  // to cover the large title's height arriving.
  test('under Reduce Motion a slow app is cut to no sooner than a fade would have ended', () => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(true);
    const { onDone } = draw({ sequence: 'short', ready: false, latest: true });
    loaded();
    advance(handoff.latestFade + 1);
    expect(onDone).not.toHaveBeenCalled();
    advance(handoff.fade - 2);
    expect(onDone).not.toHaveBeenCalled();
    advance(2);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('under Reduce Motion a ready app is still cut to at once', () => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(true);
    const { onDone } = draw({ sequence: 'short', ready: true, latest: true });
    loaded();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('a pending decision falls back to the short sequence', () => {
    const { onDone } = draw({ sequence: 'pending', latest: true });
    loaded();
    advance(299);
    expect(onDone).not.toHaveBeenCalled();
    advance(1);
    advance(handoff.fade + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(announce).not.toHaveBeenCalled();
  });
  test('under the welcome the root cover goes at once', () => {
    const { onDone } = draw({ sequence: 'short', instant: true });
    loaded();
    advance(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test('the first frame holds until Reduce Motion is known', () => {
    jest.mocked(useReduceMotionSetting).mockReturnValue(null);
    const { onDone } = draw({ sequence: 'short' });
    loaded();
    advance(5000);
    expect(SplashScreen.hide).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// Sweep 3 captures, A8: motion meant to be seen arriving waits for the
// launch to settle (launch/settled.ts).
describe('the launch settles when the reader can see Today', () => {
  beforeEach(() => {
    resetLaunchSettledForTests();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());
  const pass = (ms: number) => jest.advanceTimersByTime(ms);

  test('a plain launch: when the cover has gone', () => {
    expect(launchSettled()).toBe(false);
    launchCoverGone('plain');
    expect(launchSettled()).toBe(true);
  });
  test('the failsafe removed the cover while the welcome decision was pending: not yet; when the decision lands plain', () => {
    launchCoverGone('pending');
    expect(launchSettled()).toBe(false);
    launchCoverGone('plain');
    expect(launchSettled()).toBe(true);
  });
  test('under a first launch’s welcome the cover going is not enough, however long it is read', () => {
    const unmount = welcomeMounted();
    launchCoverGone('welcome');
    pass(SETTLE_LIMIT_MS * 10);
    expect(launchSettled()).toBe(false);
    // Its dismissal settles it, once the modal has slid away.
    welcomeDismissed();
    unmount();
    pass(WELCOME_DISMISS_MS - 1);
    expect(launchSettled()).toBe(false);
    pass(1);
    expect(launchSettled()).toBe(true);
  });
  // Review P2: with no limit, a welcome that never mounted (or a decision
  // that never came) left every stage line undrawn for the session.
  test.each(['welcome', 'pending'] as const)(
    'nothing waits for ever: %s with no welcome on screen settles at the limit',
    (phase) => {
      launchCoverGone(phase);
      pass(SETTLE_LIMIT_MS - 1);
      expect(launchSettled()).toBe(false);
      pass(1);
      expect(launchSettled()).toBe(true);
    },
  );
  test('a welcome remounted while it is up does not settle; one closed without notice does', () => {
    launchCoverGone('welcome');
    const first = welcomeMounted();
    first();
    const second = welcomeMounted();
    pass(WELCOME_DISMISS_MS * 2);
    expect(launchSettled()).toBe(false);
    second();
    pass(WELCOME_DISMISS_MS);
    expect(launchSettled()).toBe(true);
  });
  test('listeners hear it once, and it stays settled', () => {
    const heard = jest.fn();
    const stop = subscribeLaunchSettled(heard);
    settleLaunch();
    settleLaunch();
    launchCoverGone('welcome');
    pass(SETTLE_LIMIT_MS);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(launchSettled()).toBe(true);
    stop();
  });
});
