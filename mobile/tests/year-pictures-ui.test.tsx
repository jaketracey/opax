/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories build inert host elements. */
import { act } from 'react';
import TestRenderer from 'react-test-renderer';
import { Image, Platform, StyleSheet, Text as NativeText } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { HeightReveal, revealMotion } from '../src/design/reveal';
import { colors } from '../src/design/tokens';
import { router } from 'expo-router';
import { Button, InlineError } from '../src/design/primitives';
import { Picture } from '../src/features/explore/Picture';
import { ArchiveCard } from '../src/features/today/DailyPair';
import { exploreFixture } from '../scripts/explore-fixture';
import {
  assertYearPictureBytes,
  yearPictureKey,
  yearPicturePath,
} from '../src/api/year-picture-policy';
import {
  YearGallery,
  creditText,
  photoIndex,
} from '../src/features/explore/YearGallery';
import { apiClient, catalogs, yearPictures } from '../src/api/runtime';
import { presentSheet } from '../src/navigation/sheets';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { YearPicture } from '../src/features/explore/pictures';

const manifest = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../portal/public/years/pictures.json'),
    'utf8',
  ),
) as Record<string, YearPicture[]>;
const year2025 = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../portal/public/years/2025.json'),
    'utf8',
  ),
);
jest.mock('expo-router', () => {
  const React = require('react');
  const part = (name: string) =>
    function Part(props: object) {
      return React.createElement(
        name,
        props,
        (props as { children?: unknown }).children,
      );
    };
  const Toolbar = Object.assign(part('Toolbar'), {
    Button: part('ToolbarButton'),
    Spacer: () => null,
    View: part('ToolbarView'),
  });
  return {
    useIsPreview: () => false,
    router: { push: jest.fn(), back: jest.fn() },
    Stack: { Screen: part('StackScreen'), Toolbar },
    Link: Object.assign(part('Link'), {
      Trigger: part('LinkTrigger'),
      Preview: () => null,
      Menu: () => null,
      MenuAction: () => null,
    }),
    useLocalSearchParams: jest.fn(() => ({})),
    useSegments: () => ['(tabs)', '(today)'],
  };
});
jest.mock('expo-glass-effect', () => ({
  GlassView: () => null,
  isLiquidGlassAvailable: () => false,
}));
jest.mock('../src/navigation/sheets', () => ({
  presentSheet: jest.fn(),
  presentSource: jest.fn((details, options) =>
    jest
      .requireMock('../src/navigation/sheets')
      .presentSheet({ kind: 'source', details, ...options }),
  ),
}));
jest.mock('../src/api/runtime', () => ({
  apiClient: { get: jest.fn(), getForAction: jest.fn() },
  yearPictures: { get: jest.fn() },
  catalogs: {
    bills: jest.fn(),
    roster: jest.fn(),
    slugs: jest.fn(),
  },
}));
jest.mock('../src/storage/two-slot', () => ({
  ...jest.requireActual('../src/storage/two-slot'),
  TwoSlotStore: class {
    read = async () => null;
    save = async () => undefined;
  },
}));
jest.mock('../src/api/image-policy', () => ({
  localImageURI: (uri: string) => {
    if (!uri.startsWith('file:///cache/')) throw new Error('not local');
    return uri;
  },
}));
let mockReduceMotion = true;
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotion: () => mockReduceMotion,
  useAccessibilitySize: () => false,
}));

/** Lays out a collapsing preview's reveal, as a device would. */
function layOutFrame(renderer: TestRenderer.ReactTestRenderer, height: number) {
  const content = renderer.root
    .findByType(HeightReveal)
    .find(
      (n) =>
        typeof n.type === 'string' && typeof n.props.onLayout === 'function',
    );
  act(() =>
    content.props.onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height } },
    }),
  );
}
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root
    .findAllByType(NativeText)
    .map((n) => {
      const flat = (c: unknown): string =>
        typeof c === 'string' || typeof c === 'number'
          ? String(c)
          : Array.isArray(c)
            ? c.map(flat).join('')
            : c && typeof c === 'object' && 'props' in c
              ? flat((c as { props: { children?: unknown } }).props.children)
              : '';
      return flat(n.props.children);
    })
    .filter(Boolean);
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(yearPictures.get)
    .mockImplementation(async (key) => `file:///cache/${key}.webp`);
});

test('the full viewer reads a local photo, keeps its frame and retries in place', async () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <Picture file={manifest['2025']![0]!.file} failure="inline" />,
    );
  });
  expect(yearPictures.get).toHaveBeenCalledTimes(1);
  const image = renderer.root.findAllByType(Image)[0]!;
  expect(image.props.resizeMode).toBe('contain');
  expect(image.props.source.uri).toBe(
    'file:///cache/2025-cooper-polling-place.webp',
  );
  const frame = renderer.root.findAllByProps({
    testID: 'tm-photo-2025-cooper-polling-place-placeholder',
  })[0]!.props.style;
  act(() => image.props.onLoad());
  expect(
    renderer.root.findAllByProps({
      testID: 'tm-photo-2025-cooper-polling-place-loaded',
    })[0]!.props.style,
  ).toEqual(frame);
  expect(frame).toMatchObject({
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: expect.anything(),
  });
  expect(apiClient.getForAction).not.toHaveBeenCalled();
  const obsoleteError = image.props.onError;
  act(() => obsoleteError());
  expect(texts(renderer)).toContain("Photo couldn't be loaded.");
  await act(async () =>
    renderer.root
      .findAllByType(Button)
      .find((n) => n.props.label === 'Try again')!
      .props.onPress(),
  );
  expect(yearPictures.get).toHaveBeenLastCalledWith(
    '2025-cooper-polling-place',
    true,
  );
  act(() => obsoleteError()); // An obsolete decode callback cannot blank the retry.
  const retried = renderer.root.findAllByType(Image)[0]!;
  act(() => retried.props.onLoad());
  expect(
    renderer.root.findAllByProps({
      testID: 'tm-photo-2025-cooper-polling-place-loaded',
    }),
  ).not.toHaveLength(0);
  act(() => renderer.unmount());
});

test('every photograph has its caption and "Photo: author · licence" beneath, and the credit opens its source', async () => {
  const photos = manifest['2025']!;
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <YearGallery year={2025} photos={photos} initial={null} />,
    );
  });
  const all = texts(renderer);
  expect(all).toContain(photos[0]!.caption);
  expect(all).toContain(`Photo: ${creditText(photos[0]!)}`);
  expect(all.join(' ')).not.toMatch(/https?:\/\//);
  const credit = renderer.root.findAll(
    (n) =>
      n.props.testID === 'tm-photo-credit-2025-cooper-polling-place' &&
      !!n.props.accessibilityLabel,
  )[0]!;
  expect(credit.props.accessibilityLabel).toBe(
    `Photo: ${photos[0]!.author}, ${photos[0]!.licence}.`,
  );
  act(() => credit.props.onPress());
  const sheet = jest.mocked(presentSheet).mock.calls[0]![0] as {
    details: { originals: { label: string; url: string }[]; asOf: unknown };
  };
  expect(sheet.details.originals[0]).toMatchObject({
    label: 'Wikimedia Commons',
    url: photos[0]!.source_url,
  });
  expect(sheet.details.asOf).toBe(photos[0]!.date);
  const adjustable = renderer.root.findAll(
    (n) => n.props.accessibilityRole === 'adjustable',
  )[0]!;
  expect(adjustable.props.accessibilityLabel).toBe(
    `Photograph 1 of ${photos.length}. ${photos[0]!.caption}. Photo: ${photos[0]!.author}, ${photos[0]!.licence}.`,
  );
  act(() =>
    adjustable.props.onAccessibilityAction({
      nativeEvent: { actionName: 'increment' },
    }),
  );
  expect(texts(renderer)).toContain(photos[1]!.caption);
  act(() =>
    adjustable.props.onAccessibilityAction({
      nativeEvent: { actionName: 'activate' },
    }),
  );
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/explore/photo',
    params: { year: '2025', photo: expect.stringMatching(/^2025-/) },
  });
  act(() => renderer.unmount());
});

test('an archive link opens its photograph; an unknown key opens the first', () => {
  const photos = manifest['2009']!;
  expect(photoIndex(photos, 'nonsense')).toBe(0);
  expect(photoIndex(photos, null)).toBe(0);
  const last = photos.at(-1)!;
  expect(
    photoIndex(
      photos,
      last.file.replace('years/pictures/2009/', '2009-').replace('.webp', ''),
    ),
  ).toBe(photos.length - 1);
});

test('the Time machine opens on a year at once, with its menu, pager, voices and dated OPAX lines', async () => {
  const TimeMachine = require('../src/features/explore/TimeMachine')
    .default as () => React.JSX.Element;
  jest.mocked(apiClient.get).mockImplementation(async (path: string) => ({
    data:
      path === '/years/pictures.json'
        ? manifest
        : require('../src/features/explore/model').decodeYear(year2025, 2025),
    stale: false,
    asOf: path === '/years/pictures.json' ? null : year2025.generated_at,
    savedAt: 1000,
  }));
  jest.mocked(catalogs.bills).mockResolvedValue({
    data: { bills: [], generated_at: '2026-09-30', count: 0, meta: {} },
    stale: false,
    asOf: '2026-09-30',
    savedAt: 1000,
  } as never);
  jest.mocked(catalogs.roster).mockResolvedValue({
    data: { people: [{ name: 'Glenn Sterle' }], meta: {} },
    stale: false,
    asOf: null,
    savedAt: 1000,
  } as never);
  jest.mocked(catalogs.slugs).mockResolvedValue({
    data: { slugs: { 'glenn-sterle': 'Glenn Sterle' } },
    stale: false,
    asOf: null,
    savedAt: 1000,
  } as never);
  const { useLocalSearchParams } = jest.requireMock('expo-router');
  useLocalSearchParams.mockReturnValue({ year: '2025', photo: 'nonsense' });
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<TimeMachine />);
  });
  await act(async () => {});
  expect(renderer.root.findAllByProps({ testID: 'tm-open' })).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({ testID: 'tm-year-input' }),
  ).toHaveLength(0);
  const menu = renderer.root.findByProps({ testID: 'tm-year-menu' });
  expect(menu.props.accessibilityLabel).toBe('Year, 2025');
  expect(texts(renderer)).toContain('2025');
  const all = texts(renderer);
  expect(all).toContain(
    'In debates on the housing crisis, cost of living, the under-16 social media ban and the energy transition',
  );
  // Glenn Sterle is on the roster: a person row; Inman Grant is text.
  expect(
    renderer.root.findAll(
      (n) =>
        typeof n.props.accessibilityLabel === 'string' &&
        n.props.accessibilityLabel.startsWith('Inman Grant'),
    ).length,
  ).toBeGreaterThan(0);
  expect(all).toContain('Glenn Sterle');
  // The pager is a step pair at the page's foot on every platform: iOS
  // draws no bottom toolbar, which the floating tab bar would cover
  // (explore-08).
  expect(
    renderer.root.findAll((n) => (n.type as unknown) === 'ToolbarButton'),
  ).toHaveLength(0);
  const step = (testID: string) =>
    renderer.root.find(
      (n) => n.props.testID === testID && typeof n.props.onPress === 'function',
    );
  expect(step('tm-previous').props.accessibilityLabel).toBe(
    'Previous year, 2024',
  );
  expect(step('tm-next').props.accessibilityLabel).toBe('Next year, 2026');
  const lines = renderer.root
    .findAll((n) =>
      ['tm-year-as-at', 'tm-voices-as-at'].includes(n.props.testID),
    )
    .map((n) => n.props.accessibilityLabel)
    .filter(Boolean);
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).toContain('OPAX');
    expect(line).not.toContain('Hansard');
    expect(line).toContain('Updated 4 Sep 2026');
  }
  expect(all.join(' ')).not.toMatch(
    /knowledge box|so far|static|manifest|register|\d{4}-\d{2}-\d{2}|—/,
  );
  act(() => renderer.unmount());
});

test('a failed archive image collapses its empty frame and keeps its caption and credit', async () => {
  const picture = manifest['2014']!.find((p) =>
    p.file.includes('march-in-march'),
  )!;
  const key = yearPictureKey('/' + picture.file);
  const bytes = exploreFixture(yearPicturePath(key), () => undefined)!;
  expect(bytes.length).toBeGreaterThan(0);
  expect(() => assertYearPictureBytes(bytes)).not.toThrow();
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(
      <ArchiveCard year={2014} picture={picture} />,
    );
  });
  expect(yearPictures.get).toHaveBeenCalledWith(key, false);
  const image = renderer.root.findByType(Image);
  expect(image.props.source.uri).toBe(`file:///cache/${key}.webp`);
  // Reduce Motion (this suite's default): the frame goes at once, with no
  // height animation, even once it has measured.
  const heights = jest.spyOn(Reanimated, 'withTiming');
  layOutFrame(renderer, 240);
  act(() => image.props.onError());
  expect(heights).not.toHaveBeenCalled();
  heights.mockRestore();
  expect(texts(renderer)).toContain(picture.caption);
  expect(texts(renderer)).toContain(`Photo: ${picture.credit}`);
  expect(texts(renderer)).not.toContain('Try again');
  expect(renderer.root.findAllByType(InlineError)).toHaveLength(0);
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  expect(
    renderer.root.findAllByProps({
      testID: `tm-photo-${key}-placeholder`,
    }),
  ).toHaveLength(0);
  act(() => renderer.unmount());
});

test.each(['ios', 'android'])(
  'on %s a failed archive frame closes its height over 200 ms so the content below slides up',
  async (os) => {
    jest.replaceProperty(Platform, 'OS', os as typeof Platform.OS);
    mockReduceMotion = false;
    const picture = manifest['2014']![0]!;
    const key = yearPictureKey('/' + picture.file);
    let renderer!: TestRenderer.ReactTestRenderer;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          <ArchiveCard year={2014} picture={picture} />,
        );
      });
      const frame = () =>
        renderer.root.findAll(
          (n) =>
            typeof n.type === 'string' &&
            n.props.testID === `tm-photo-${key}-placeholder`,
        ).length > 0;
      expect(frame()).toBe(true);
      // The frame sits in a reveal from the start: no height animation, and
      // nothing clipped, while it shows.
      expect(
        renderer.root
          .findByType(HeightReveal)
          .findAll(
            (n) =>
              typeof n.type === 'string' &&
              n.props.testID === `tm-photo-${key}-placeholder`,
          ),
      ).toHaveLength(1);
      layOutFrame(renderer, 240);
      jest.useFakeTimers();
      const heights: [number, boolean][] = [];
      const timing = jest
        .spyOn(Reanimated, 'withTiming')
        .mockImplementation((to) => {
          heights.push([to as number, frame()]);
          return to;
        });
      act(() => renderer.root.findByType(Image).props.onError());
      // The height closes to 0 with the standard ease while the 4:3 frame is
      // still drawn, and only then is the frame removed.
      expect(heights).toEqual([[0, true]]);
      expect(timing.mock.calls[0]![1]).toBe(revealMotion);
      expect(frame()).toBe(true);
      act(() => jest.advanceTimersByTime(revealMotion.duration));
      expect(frame()).toBe(false);
      expect(texts(renderer)).toContain(picture.caption);
    } finally {
      mockReduceMotion = true;
      jest.useRealTimers();
      jest.restoreAllMocks();
      if (renderer) act(() => renderer.unmount());
    }
  },
);

test('a viewer photo that fails inline never animates a collapse', async () => {
  mockReduceMotion = false;
  const heights = jest.spyOn(Reanimated, 'withTiming');
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(
        <Picture file={manifest['2025']![0]!.file} failure="inline" />,
      );
    });
    // Only a collapsing preview sits in a reveal.
    expect(renderer.root.findAllByType(HeightReveal)).toHaveLength(0);
    act(() => renderer.root.findByType(Image).props.onError());
    expect(renderer.root.findAllByType(InlineError)).toHaveLength(1);
    expect(heights).not.toHaveBeenCalled();
  } finally {
    mockReduceMotion = true;
    heights.mockRestore();
    act(() => renderer.unmount());
  }
});

test('an archive fetch failure also leaves no empty photo frame on Today', async () => {
  jest.mocked(yearPictures.get).mockRejectedValue(new Error('offline'));
  let renderer!: TestRenderer.ReactTestRenderer;
  const picture = manifest['2014']![0]!;
  await act(async () => {
    renderer = TestRenderer.create(
      <ArchiveCard year={2014} picture={picture} />,
    );
  });
  // No frame is drawn, not even an empty one.
  expect(
    renderer.root
      .findByType(Picture)
      .findAll((n) => typeof n.type === 'string'),
  ).toHaveLength(0);
  expect(texts(renderer)).toContain(picture.caption);
  act(() => renderer.unmount());
});

test.each(['ios', 'android'])(
  'a failed full-screen photo is readable on %s and retries locally',
  async (os) => {
    const original = Object.getOwnPropertyDescriptor(Platform, 'OS')!;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          <Picture
            file={manifest['2025']![0]!.file}
            ground="black"
            failure="inline"
          />,
        );
      });
      act(() => renderer!.root.findByType(Image).props.onError());
      if (os === 'ios') {
        expect(renderer!.root.findAllByType(InlineError)).toHaveLength(1);
      } else {
        expect(renderer!.root.findAllByType(InlineError)).toHaveLength(0);
        const retry = renderer!.root.findAll(
          (n) =>
            n.props.accessibilityLabel === 'Try again' &&
            typeof n.props.onPress === 'function',
        )[0]!;
        expect(StyleSheet.flatten(retry.props.style).minHeight).toBe(48);
        expect(
          StyleSheet.flatten(retry.findByType(NativeText).props.style).color,
        ).toBe(colors.onBand);
        await act(async () => retry.props.onPress());
        expect(yearPictures.get).toHaveBeenLastCalledWith(
          '2025-cooper-polling-place',
          true,
        );
      }
    } finally {
      if (renderer) act(() => renderer!.unmount());
      Object.defineProperty(Platform, 'OS', original);
    }
  },
);
