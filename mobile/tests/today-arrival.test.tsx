/**
 * Sweep 3, lane A: Today's first second and last line. The launch skeleton
 * is the edition card's outline (item 1), the page ends on a sentence above
 * the independence line (item 7), and the bill plate's timeline draws once
 * per launch, finished under Reduce Motion and for a still plate (item 8).
 * The dot map's neutral state (item 1) is pinned in today-dots.test.ts and
 * Today's first frame in today.test.tsx.
 */
import { act, type ReactElement, type ReactNode } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import type * as ReanimatedTypes from 'react-native-reanimated';
import TestRenderer, { type ReactTestInstance } from 'react-test-renderer';
import snapshot from '../scripts/fixture-snapshot.json';
import {
  decodeEdition,
  editionFor,
  type EditionView,
} from '../src/api/catalogs';
import { editionPath } from '../src/api/policy';
import { catalogs } from '../src/api/runtime';
import { copy } from '../src/design/copy';
import { PageFoot } from '../src/design/record';
import { Text } from '../src/design/text';
import { colors, hairline, radii, rhythm } from '../src/design/tokens';
import {
  EditionCard,
  EditionSkeleton,
} from '../src/features/edition/EditionCard';
import { Plate, timelineStop } from '../src/features/edition/Plate';
import { resetTimelineDrawForTests } from '../src/features/edition/timeline-draw';
import { TodayFoot } from '../src/features/today/Foot';
import { SittingLine, useSittingRead } from '../src/features/today/SittingLine';
import { decodeSittingDays, nextSitting } from '../src/features/today/sitting';
import { todayFixture } from '../src/features/today/launch-fixture';
// Trimmed 2026 calendar: Senate only 16 to 19 Nov, both 23 to 26 Nov.
import raw from './fixtures/sitting-days.json';
import { responseBytes } from './fixture-bytes';

let mockReduced: boolean | null = false;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => mockReduced,
}));
// Jest reads as an e2e build (no build configuration fails closed to e2e),
// so the draw is allowed by the capture argument a motion clip passes.
jest.mock('../src/features/today/launch-fixture', () => ({
  ...jest.requireActual('../src/features/today/launch-fixture'),
  todayFixture: jest.fn(),
}));
jest.mock('../src/api/runtime', () => ({
  catalogs: {
    sittingDays: jest.fn(),
    bills: jest.fn(() => new Promise(() => {})),
    bill: jest.fn(() => new Promise(() => {})),
    roster: jest.fn(() => new Promise(() => {})),
    slugs: jest.fn(() => new Promise(() => {})),
    directory: jest.fn(() => new Promise(() => {})),
  },
  portraits: { get: jest.fn(async () => null) },
  yearPictures: { get: jest.fn(async () => null) },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => uri,
}));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Native = require('react-native');
  const Wrap = ({ children, ...props }: { children?: ReactNode }) =>
    React.createElement(Native.View, props, children);
  const Link = Object.assign(
    (props: { children?: ReactNode }) => React.createElement(Wrap, props),
    {
      Trigger: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      Preview: () => null,
      Menu: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
      MenuAction: (props: { children?: ReactNode }) =>
        React.createElement(Wrap, props),
    },
  );
  return {
    Link,
    router: { push: jest.fn(), navigate: jest.fn() },
    useSegments: () => [],
  };
});

const Reanimated = jest.requireMock(
  'react-native-reanimated',
) as typeof ReanimatedTypes;

const block = editionFor(
  decodeEdition(JSON.parse(responseBytes(snapshot, editionPath).toString())),
);
const edition: EditionView = block.data!;
const sitting = decodeSittingDays(raw);
// Saturday 14 November, noon in Sydney.
const saturday = new Date('2026-11-14T01:00:00Z');

const mounted: TestRenderer.ReactTestRenderer[] = [];
async function render(element: ReactElement) {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  mounted.push(renderer);
  return renderer;
}
const fixture = (plateDraw: 'on' | null) =>
  jest.mocked(todayFixture).mockReturnValue({
    seat: null,
    editionCache: null,
    editionAge: null,
    welcomeDeclined: null,
    plateDraw,
  });
beforeEach(() => {
  jest.clearAllMocks();
  mockReduced = false;
  resetTimelineDrawForTests();
  fixture('on');
});
afterEach(() => {
  act(() => mounted.splice(0).forEach((r) => r.unmount()));
  jest.restoreAllMocks();
});
const host = (root: ReactTestInstance, testID: string) =>
  root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
const flat = (node: ReactTestInstance) =>
  (StyleSheet.flatten(node.props.style) ?? {}) as Record<string, unknown>;

describe('item 1: the launch skeleton is the edition card’s outline', () => {
  test('a plate one step darker than the bars, inside the raised card’s corners, hairline edge and shadow', async () => {
    const { root } = await render(<EditionSkeleton />);
    const plate = flat(host(root, 'today-edition-loading-plate')[0]!);
    // Sunken on Today's sunken ground drew no plate at all (crop-01).
    expect(plate.backgroundColor).toBe(colors.dividerSubtle);
    expect(plate.backgroundColor).not.toBe(colors.sunken);
    expect(plate.height).toBe(196);
    const bars = flat(host(root, 'today-edition-loading-source')[0]!);
    expect(bars.backgroundColor).toBe(colors.sunken);
    const card = flat(host(root, 'today-edition-loading')[0]!);
    expect(card).toMatchObject({
      backgroundColor: colors.raised,
      borderRadius: radii.container,
      overflow: 'hidden',
    });
    // The edge is drawn over the card: it adds nothing to the geometry, so
    // the loaded card lands where the outline was.
    const edge = host(root, 'today-edition-loading-edge')[0]!;
    expect(flat(edge)).toMatchObject({
      position: 'absolute',
      borderRadius: radii.container,
      borderWidth: hairline,
      borderColor: colors.dividerSubtle,
    });
    expect(edge.props.pointerEvents).toBe('none');
    expect(flat(host(root, 'today-edition-loading-outline')[0]!)).toMatchObject(
      { shadowOpacity: 0.08, shadowRadius: 20 },
    );
  });
});

describe('item 7: Today ends on a sentence', () => {
  const answered = (file: unknown) => ({
    record:
      file === null
        ? null
        : ({ data: file, stale: false, savedAt: 1 } as never),
  });
  const foot = async (file: unknown, now = saturday) =>
    (await render(<TodayFoot ending={{ now, sitting: answered(file) }} />))
      .root;
  // Today's arrangement: one calendar read for the line under the date and
  // the closing line.
  function Page({ attempt = 0 }: { attempt?: number }) {
    const read = useSittingRead(attempt);
    return (
      <>
        <SittingLine now={saturday} sitting={read} />
        <TodayFoot ending={{ now: saturday, sitting: read }} />
      </>
    );
  }
  const ending = (root: ReactTestInstance) =>
    host(root, 'today-ending')[0]?.findByType(Text).props.children;

  test('the wording, in one place, in the sitting line’s form, Australian dates and no dashes', () => {
    expect(copy.todayEnding('Saturday 14 November')).toBe(
      "That's the record for Saturday 14 November.",
    );
    expect(
      copy.todayEnding('Saturday 14 November', {
        houses: 'both',
        words: 'Tuesday 17 November',
      }),
    ).toBe(
      "That's the record for Saturday 14 November. Parliament next sits Tuesday 17 November.",
    );
    expect(
      copy.todayEnding('Friday 23 October', {
        houses: 'house',
        words: 'Monday 26 October',
      }),
    ).toBe(
      "That's the record for Friday 23 October. The House next sits Monday 26 October.",
    );
    for (const houses of ['both', 'house', 'senate'] as const)
      expect(
        copy.todayEnding('Saturday 14 November', { houses, words: 'x' }),
      ).not.toMatch(/[—–]/);
  });

  test('a bronze hairline, then one line the screen reader reads in one pass, above the independence line', async () => {
    const root = await foot(sitting);
    const block = host(root, 'today-ending')[0]!;
    expect(flat(block)).toMatchObject({
      alignItems: 'center',
      gap: rhythm.block,
    });
    const rule = host(root, 'today-ending-rule')[0]!;
    expect(flat(rule)).toEqual({
      width: 40,
      height: hairline,
      backgroundColor: colors.todayDotBronze,
    });
    expect(rule.props).toMatchObject({
      accessible: false,
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    const texts = block.findAllByType(Text);
    expect(texts).toHaveLength(1);
    expect(texts[0]!.props).toMatchObject({
      variant: 'secondary',
      children:
        "That's the record for Saturday 14 November. The Senate next sits Monday 16 November.",
    });
    // Above the disclaimer and the correction link, which stay as they were.
    const order = root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          ['today-ending', 'today-independence'].includes(n.props.testID),
      )
      .map((n) => n.props.testID);
    expect(order).toEqual(['today-ending', 'today-independence']);
    expect(root.findAllByType(PageFoot)).toHaveLength(1);
    expect(flat(host(root, 'today-foot')[0]!).gap).toBe(rhythm.group);
  });

  test('with no calendar, the date alone', async () => {
    expect(ending(await foot(null))).toBe(
      "That's the record for Saturday 14 November.",
    );
  });

  test('nothing is drawn until the calendar answers, then the whole sentence at once', async () => {
    let answer!: (read: unknown) => void;
    jest.mocked(catalogs.sittingDays).mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }) as never,
    );
    const { root } = await render(<Page />);
    expect(host(root, 'today-ending')).toHaveLength(0);
    expect(host(root, 'today-independence')).toHaveLength(1);
    await act(async () => answer(answered(sitting).record));
    expect(ending(root)).toBe(
      "That's the record for Saturday 14 November. The Senate next sits Monday 16 November.",
    );
  });

  test('one calendar read serves the sitting line and the closing line, and a pull revalidates both', async () => {
    jest
      .mocked(catalogs.sittingDays)
      .mockResolvedValue(answered(sitting).record);
    const r = await render(<Page />);
    expect(catalogs.sittingDays).toHaveBeenCalledTimes(1);
    expect(catalogs.sittingDays).toHaveBeenLastCalledWith(false);
    expect(host(r.root, 'today-sitting')).not.toHaveLength(0);
    expect(ending(r.root)).toMatch(/Monday 16 November\.$/);
    // A pull: one revalidation, both lines from its answer.
    jest.mocked(catalogs.sittingDays).mockResolvedValue(answered(null).record);
    await act(async () => r.update(<Page attempt={1} />));
    expect(catalogs.sittingDays).toHaveBeenCalledTimes(2);
    expect(catalogs.sittingDays).toHaveBeenLastCalledWith(true);
    expect(host(r.root, 'today-sitting')).toHaveLength(0);
    expect(ending(r.root)).toBe("That's the record for Saturday 14 November.");
  });

  test('a failed calendar read still ends the page, with the date alone', async () => {
    jest.mocked(catalogs.sittingDays).mockRejectedValue(new Error('aborted'));
    const { root } = await render(<Page />);
    expect(ending(root)).toBe("That's the record for Saturday 14 November.");
  });

  test('without an ending the foot is as it was', async () => {
    const { root } = await render(<TodayFoot />);
    expect(host(root, 'today-ending')).toHaveLength(0);
    expect(flat(host(root, 'today-foot')[0]!).gap).toBeUndefined();
  });

  test.each([
    // A sitting day looks past itself to the next one.
    [
      'a Senate-only sitting day',
      '2026-11-17T01:00:00Z',
      'senate',
      'Wednesday 18 November',
    ],
    [
      'the weekend between sittings',
      '2026-11-21T01:00:00Z',
      'both',
      'Monday 23 November',
    ],
    ['a weekday off', '2026-11-13T01:00:00Z', 'senate', 'Monday 16 November'],
  ])('the next sitting day on %s', (_case, iso, houses, words) => {
    expect(nextSitting(sitting, new Date(iso))).toEqual({ houses, words });
  });

  test('the next sitting day is left out where the sitting line would be', () => {
    // The trimmed calendar's last day is 26 November.
    expect(nextSitting(sitting, new Date('2026-11-26T01:00:00Z'))).toBeNull();
    expect(
      nextSitting(
        { ...sitting, expires: '2026-11-20' },
        new Date('2026-11-21T01:00:00Z'),
      ),
    ).toBeNull();
    expect(
      nextSitting(
        { ...sitting, coverage: { ...sitting.coverage, first: '2026-11-15' } },
        saturday,
      ),
    ).toBeNull();
  });
});

describe('item 8: the bill plate’s timeline draws once per launch', () => {
  const plate = (props: Partial<React.ComponentProps<typeof Plate>> = {}) =>
    render(<Plate edition={edition} {...props} />);
  const rail = (root: ReactTestInstance) =>
    flat(host(root, 'today-edition-art-timeline-rail')[0]!);
  const stops = (root: ReactTestInstance) =>
    root
      .findAll(
        (n) =>
          typeof n.type === 'string' &&
          /^today-edition-art-timeline-stop-\d+$/.test(n.props.testID),
      )
      .map(flat);
  const finished = (root: ReactTestInstance) => {
    expect(rail(root).transform).toEqual([{ scaleX: 1 }]);
    expect(stops(root)).toHaveLength(edition.facts.events.length);
    for (const stop of stops(root)) {
      expect(stop.opacity).toBe(1);
      expect(stop.transform).toEqual([{ scale: 1 }]);
    }
  };

  test('the fixture is a bill with a five-stop line', () => {
    expect(edition.kind).toBe('bill');
    expect(edition.facts.events).toHaveLength(5);
  });

  test('its first appearance starts undrawn and draws left to right over 600 ms', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const delay = jest.spyOn(Reanimated, 'withDelay');
    const { root } = await plate();
    expect(rail(root).transform).toEqual([{ scaleX: 0 }]);
    expect(rail(root).transformOrigin).toBe('left');
    for (const stop of stops(root)) expect(stop.opacity).toBe(0);
    expect(timing).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ duration: 600 }),
    );
    // The last stop's swell follows the rail.
    expect(delay).toHaveBeenCalledWith(600, expect.anything());
  });

  test('a second appearance of the same edition this launch is drawn finished', async () => {
    await plate();
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
    const timing = jest.spyOn(Reanimated, 'withTiming');
    // On the story page, after the card.
    const { root } = await plate({ story: true, testID: 'today-edition' });
    finished(root);
    expect(timing).not.toHaveBeenCalled();
  });

  test.each([
    ['Reduce Motion', () => (mockReduced = true)],
    ['the setting not yet known', () => (mockReduced = null)],
    ['an e2e build without OPAXPlateDraw', () => fixture(null)],
  ])('%s: finished and still from the first frame', async (_case, given) => {
    given();
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const { root } = await plate();
    finished(root);
    expect(timing).not.toHaveBeenCalled();
  });

  test('a still plate (an image of it) is finished, and leaves the reader’s draw for the card', async () => {
    const timing = jest.spyOn(Reanimated, 'withTiming');
    const { root } = await plate({ still: true });
    finished(root);
    expect(timing).not.toHaveBeenCalled();
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
    expect(rail((await plate()).root).transform).toEqual([{ scaleX: 0 }]);
  });

  describe('Today’s card draws only where the reader sees it arrive', () => {
    // A phone at Large (Jest's default window is an accessibility size).
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    const atScale = (fontScale: number) =>
      Dimensions.set({
        window: { width: 402, height: 874, scale: 3, fontScale },
        screen: { width: 402, height: 874, scale: 3, fontScale },
      });
    beforeEach(() => atScale(1));
    afterEach(() => Dimensions.set({ window, screen }));
    const card = (still?: boolean) =>
      render(
        <EditionCard
          edition={block}
          tier="fresh"
          today={edition.date}
          still={still}
        />,
      );
    test('the top slot’s card draws', async () => {
      expect(rail((await card()).root).transform).toEqual([{ scaleX: 0 }]);
    });
    test('the late slot’s card, below the fold, is finished and leaves the draw for the story', async () => {
      finished((await card(true)).root);
      act(() => mounted.splice(0).forEach((r) => r.unmount()));
      const story = await plate({ story: true, testID: 'today-edition' });
      expect(rail(story.root).transform).toEqual([{ scaleX: 0 }]);
    });
    test('at accessibility sizes the card is finished and leaves the draw for the story', async () => {
      atScale(3.1);
      finished((await card()).root);
      act(() => mounted.splice(0).forEach((r) => r.unmount()));
      atScale(1);
      const story = await plate({ story: true, testID: 'today-edition' });
      expect(rail(story.root).transform).toEqual([{ scaleX: 0 }]);
    });
  });

  test('a plate seen finished under Reduce Motion has had its turn', async () => {
    mockReduced = true;
    await plate();
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
    mockReduced = false;
    finished((await plate()).root);
  });

  test('each stop lands as the line reaches it, and the last swells then settles', () => {
    // Halfway: the first two stops are down, the middle one is landing.
    expect(timelineStop(0.5, 0, 0, false).opacity).toBe(1);
    expect(timelineStop(0.5, 0, 0.25, false).opacity).toBe(1);
    expect(timelineStop(0.5, 0, 0.5, false).opacity).toBeCloseTo(0.5);
    expect(timelineStop(0.5, 0, 0.75, false).opacity).toBe(0);
    expect(timelineStop(0.5, 0, 1, true).opacity).toBe(0);
    // The rail done: the last stop rises to 1.25 and comes back to 1.
    expect(timelineStop(1, 0, 1, true)).toEqual({ opacity: 1, scale: 1 });
    expect(timelineStop(1, 0.5, 1, true).scale).toBeCloseTo(1.25);
    expect(timelineStop(1, 0.5, 0.75, false).scale).toBe(1);
    expect(timelineStop(1, 1, 1, true)).toEqual({ opacity: 1, scale: 1 });
  });
});
