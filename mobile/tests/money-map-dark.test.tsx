import { act } from 'react';
import * as Native from 'react-native';
import TestRenderer from 'react-test-renderer';
import { contrastRatio } from '../src/design/contrast';
import {
  dark,
  light,
  partyColors,
  partyColorsDark,
} from '../src/design/palette';
import { partyDot } from '../src/design/party';
import { chartIndustry, chartIndustryDark } from '../src/design/tokens';
import { decodeMoneyGraph } from '../src/features/money/data';
import { labelSlots } from '../src/features/money/map/labels';
import { layoutFor } from '../src/features/money/map/layout';
import { MoneyMap } from '../src/features/money/map/MoneyMap';
import { buildModel } from '../src/features/money/map/model';
import {
  paintFocus,
  paintNodes,
  type Painter,
} from '../src/features/money/map/scene';
import {
  clusterColour,
  DARK_MAP,
  inkOn,
  mapTheme,
  markOn,
  nodeColour,
  partyMapColour,
  SURFACE,
  SURFACE_DARK,
} from '../src/features/money/ported/palette';
import { defaultMoneyFilters, moneyView } from '../src/features/money/view';
import { pinned } from './pinned';

// The dark money map (dark mode, 19 Nov 2026). Skia draws plain hex, so
// nothing on the map follows the system by itself: the theme chooses every
// colour, and the model and the recorded pictures are built again when it
// changes.

const mockSettlers: (() => void)[] = [];
jest.mock('../src/features/money/map/settle', () => ({
  settleLayout: (_layout: unknown, onSettled: () => void) => {
    mockSettlers.push(onSettled);
    return () => undefined;
  },
}));
jest.mock('react-native-gesture-handler', () =>
  jest.requireActual('./gesture-mock'),
);
jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));
jest.mock('../src/features/money/money-probe', () => ({
  MoneyTestHooks: () => null,
  useMoneyMapPerf: () => null,
  useMoneyMapProbe: () => undefined,
}));
// Each recorded picture, as the set of colours it was painted with.
const mockRecorded: Set<string>[] = [];
jest.mock('../src/features/money/map/skia-painter', () => ({
  recordPicture: (_bounds: unknown, paint: (painter: unknown) => void) => {
    const colours = new Set<string>();
    paint({
      circle: (_x: number, _y: number, _r: number, hex: string) =>
        void colours.add(hex),
      ring: (_x: number, _y: number, _r: number, _w: number, hex: string) =>
        void colours.add(hex),
      line: (
        _a: number,
        _b: number,
        _c: number,
        _d: number,
        _w: number,
        hex: string,
      ) => void colours.add(hex),
    });
    mockRecorded.push(colours);
    return { colours };
  },
}));

const graph = decodeMoneyGraph(pinned('/graph/money.json'));
const view = moneyView(graph, defaultMoneyFilters(graph));
const lightTheme = mapTheme('light');
const darkTheme = mapTheme('dark', false, 'dark');
const lightModel = buildModel(view, lightTheme);
const darkModel = buildModel(view, darkTheme);
const RAISED_DARK = dark.raised;

afterEach(() => jest.restoreAllMocks());

describe('the theme', () => {
  test('the full dark map ships, and one word is the fallback', () => {
    expect(DARK_MAP).toBe('dark');
    expect(mapTheme('dark')).toBe(darkTheme);
    expect(darkTheme).toMatchObject({
      appearance: 'dark',
      surface: dark.paper,
      ink: dark.ink,
      moneyInk: dark.moneyInk,
      sheet: false,
    });
    // The fallback: light marks on a light sheet the stage paints.
    expect(mapTheme('dark', false, 'sheet')).toMatchObject({
      appearance: 'light',
      surface: light.paper,
      ink: light.ink,
      sheet: true,
    });
    expect(mapTheme('light', false, 'sheet').sheet).toBe(false);
  });

  test('a theme is one object per answer, so a memo keyed on it holds', () => {
    expect(mapTheme('light')).toBe(lightTheme);
    expect(mapTheme('dark', false, 'dark')).toBe(darkTheme);
    expect(mapTheme('dark', true, 'dark')).not.toBe(darkTheme);
    expect(lightTheme).not.toBe(darkTheme);
    expect(SURFACE).toBe(light.paper);
    expect(SURFACE_DARK).toBe(dark.paper);
  });
});

describe('the dark palette', () => {
  test('industries take the dark token set: 3:1 as marks, 4.5:1 as names', () => {
    expect(chartIndustryDark.map(([key]) => key)).toEqual(
      chartIndustry.map(([key]) => key),
    );
    for (const [key, pair] of chartIndustryDark) {
      expect(clusterColour(key, 'dark')).toEqual(pair);
      for (const ground of [SURFACE_DARK, RAISED_DARK]) {
        expect(contrastRatio(pair.colour, ground)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(pair.ink, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Light is the set it always was.
    for (const [key, pair] of chartIndustry)
      expect(clusterColour(key)).toEqual(pair);
    expect(clusterColour('no such industry', 'dark')).toEqual(
      clusterColour('other', 'dark'),
    );
  });

  test('parties take the dark dots, with names that read on dark', () => {
    expect(partyMapColour('Labor', 'dark').colour).toBe(partyColorsDark.labor);
    expect(partyMapColour('Liberal', 'dark').colour).toBe(
      partyColorsDark.liberal,
    );
    expect(partyMapColour('Labor').colour).toBe(partyColors.labor);
    for (const node of darkModel.nodes.filter((n) => n.kind === 'party')) {
      const { colour, ink } = partyMapColour(node.label, 'dark');
      expect(node.colour).toBe(colour);
      expect(contrastRatio(colour, SURFACE_DARK)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(ink, SURFACE_DARK)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('a colour is moved away from its ground: darker on paper, lighter on dark', () => {
    const navy = '#1D4F91';
    expect(inkOn(navy)).toBe('#1d4f91');
    const lifted = inkOn(navy, SURFACE_DARK);
    expect(contrastRatio(lifted, SURFACE_DARK)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(lifted, SURFACE_DARK)).toBeLessThan(5.4);
    expect(contrastRatio(lifted, '#000000')).toBeGreaterThan(
      contrastRatio(navy, '#000000'),
    );
    // A colour that already reads is left alone.
    expect(inkOn('#EDC948', SURFACE_DARK)).toBe('#edc948');
    expect(markOn('#EDC948', SURFACE_DARK)).toBe('#edc948');
  });

  test('a colour the export chose is drawn as sent on paper and lifted to a mark on dark', () => {
    const hub = { kind: 'hub', group: 'public money', colour: '#17324D' };
    expect(nodeColour(hub)).toBe('#17324D');
    expect(contrastRatio(hub.colour, SURFACE_DARK)).toBeLessThan(3);
    expect(
      contrastRatio(nodeColour(hub, 'dark'), SURFACE_DARK),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('the dark model', () => {
  test('says which appearance it was built for; the default is light', () => {
    expect(buildModel(view).appearance).toBe('light');
    expect(lightModel.appearance).toBe('light');
    expect(darkModel.appearance).toBe('dark');
  });

  test('the light model is the one the map always drew', () => {
    // Every expectation is read from the token sources (the industry chart
    // set, the party dots, the light palette), never from the map's theme
    // or its palette helpers: a change to the light path fails here.
    const industry = new Map(chartIndustry);
    const pair = (group: string) =>
      industry.get(group) ?? industry.get('other')!;
    const source = new Map(view.nodes.map((n) => [n.id, n]));
    const seen = { party: 0, dotted: 0, hub: 0, donor: 0 };
    expect(lightModel.nodes.length).toBe(view.nodes.length);
    for (const node of lightModel.nodes) {
      const sent = source.get(node.id)!;
      seen[node.kind]++;
      if (node.kind === 'party') {
        // A party's disc is its dot; a label the app does not know as a
        // party takes the neutral parties grey. Its name is the parties ink.
        const dot = partyDot(node.label, 'light');
        if (dot) seen.dotted++;
        expect(node.colour).toBe(dot ?? pair('parties').colour);
        expect(node.ink).toBe(pair('parties').ink);
      } else if (node.kind === 'hub') {
        // A hub is drawn in the colour the export sent, or the money ink.
        expect(node.colour).toBe(sent.colour || light.moneyInk);
        expect(node.ink).toBe(light.moneyInk);
      } else {
        expect(node.colour).toBe(sent.colour || pair(sent.group).colour);
        expect(node.ink).toBe(pair(sent.group).ink);
      }
    }
    expect(seen.party).toBeGreaterThan(0);
    expect(seen.dotted).toBeGreaterThan(0);
    expect(seen.hub).toBeGreaterThan(0);
    expect(seen.donor).toBeGreaterThan(0);
    expect(partyDot('Labor', 'light')).toBe(partyColors.labor);
    // The legend: the public money register in the money ink, every other
    // cluster in its industry pair.
    for (const cluster of lightModel.clusters) {
      const money = cluster.nodes.some(
        (i) => lightModel.nodes[i]!.kind === 'hub',
      );
      expect([cluster.colour, cluster.ink]).toEqual(
        money
          ? [light.moneyInk, light.moneyInk]
          : [pair(cluster.key).colour, pair(cluster.key).ink],
      );
    }
    // A flow takes its source's colour.
    for (const edge of lightModel.edges)
      expect(edge.colour).toBe(lightModel.nodes[edge.a]!.colour);
    // The default argument is the light theme.
    expect(buildModel(view).nodes.map((n) => [n.colour, n.ink])).toEqual(
      lightModel.nodes.map((n) => [n.colour, n.ink]),
    );
  });

  test('every mark reads on dark paper, every name as text', () => {
    expect(darkModel.nodes.length).toBe(lightModel.nodes.length);
    for (const node of darkModel.nodes) {
      expect(contrastRatio(node.colour, SURFACE_DARK)).toBeGreaterThanOrEqual(
        3,
      );
      expect(contrastRatio(node.ink, SURFACE_DARK)).toBeGreaterThanOrEqual(4.5);
    }
    for (const cluster of darkModel.clusters) {
      expect(
        contrastRatio(cluster.colour, SURFACE_DARK),
      ).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(cluster.ink, SURFACE_DARK)).toBeGreaterThanOrEqual(
        4.5,
      );
      // The legend's swatches sit on a raised sheet.
      expect(contrastRatio(cluster.colour, RAISED_DARK)).toBeGreaterThanOrEqual(
        3,
      );
    }
    const hubs = darkModel.nodes.filter((n) => n.kind === 'hub');
    expect(hubs.length).toBeGreaterThan(0);
    for (const hub of hubs) expect(hub.ink).toBe(dark.moneyInk);
    // A flow takes its source's colour, in the same appearance.
    for (const edge of darkModel.edges)
      expect(edge.colour).toBe(darkModel.nodes[edge.a]!.colour);
  });

  test('names on the dark map are set in inks that read on it', () => {
    const layout = layoutFor(graph, 402 / 600);
    const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
    const at = (i: number) => {
      const li = index.get(darkModel.nodes[i]!.id) ?? 0;
      return { x: layout.x[li]!, y: layout.y[li]! };
    };
    const focus = darkModel.nodes.findIndex((n) => n.kind === 'party');
    const slots = labelSlots(darkModel, layout.centres, at, focus);
    expect(slots.length).toBeGreaterThan(10);
    for (const slot of slots)
      expect(contrastRatio(slot.ink, SURFACE_DARK)).toBeGreaterThanOrEqual(4.5);
    // The same names on paper keep their paper inks.
    const onPaper = labelSlots(lightModel, layout.centres, at, focus);
    for (const slot of onPaper)
      expect(contrastRatio(slot.ink, SURFACE)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the dark scene', () => {
  const colourPainter = () => {
    const colours = new Set<string>();
    const painter: Painter = {
      circle: (_x, _y, _r, hex) => void colours.add(hex),
      ring: (_x, _y, _r, _w, hex) => void colours.add(hex),
      line: (_a, _b, _c, _d, _w, hex) => void colours.add(hex),
    };
    return { painter, colours };
  };
  const at = () => ({ x: 0, y: 0 });

  test('rims, hub centres and the halo are the theme’s, never paper', () => {
    const { painter, colours } = colourPainter();
    paintNodes(painter, darkModel, at, 'large', darkTheme.surface);
    paintNodes(painter, darkModel, at, 'small', darkTheme.surface);
    const hub = darkModel.nodes.findIndex((n) => n.kind === 'hub');
    paintFocus(painter, darkModel, at, hub, darkTheme.ink, darkTheme.surface);
    expect(colours.has(SURFACE_DARK)).toBe(true);
    expect(colours.has(dark.ink)).toBe(true);
    expect(colours.has(SURFACE)).toBe(false);
    expect(colours.has(light.ink)).toBe(false);
    for (const hex of colours)
      if (hex !== SURFACE_DARK)
        expect(contrastRatio(hex, SURFACE_DARK)).toBeGreaterThanOrEqual(3);
  });
});

describe('a live switch', () => {
  const setScheme = (scheme: 'light' | 'dark') => {
    jest.spyOn(Native.Appearance, 'getColorScheme').mockReturnValue(scheme);
    jest.spyOn(Native, 'useColorScheme').mockReturnValue(scheme);
  };
  const stage = (model: typeof lightModel) => (
    <MoneyMap
      graph={graph}
      model={model}
      focus={model.nodes[0]!.id}
      onFocus={() => undefined}
      insets={{ top: 100, bottom: 100, left: 8, right: 8 }}
      cacheKey="federal"
      accessibilityLabel="Money map"
    />
  );

  test('the stage records its pictures again in the new colours', async () => {
    mockSettlers.length = 0;
    mockRecorded.length = 0;
    setScheme('light');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(stage(lightModel));
    });
    act(() =>
      tree.root.findByProps({ testID: 'money-map-stage' }).props.onLayout({
        nativeEvent: { layout: { width: 380, height: 700 } },
      }),
    );
    await act(async () => mockSettlers.forEach((settled) => settled()));
    const painted = () =>
      new Set(mockRecorded.flatMap((colours) => [...colours]));
    expect(mockRecorded.length).toBeGreaterThan(0);
    expect(painted().has(SURFACE)).toBe(true);
    expect(painted().has(SURFACE_DARK)).toBe(false);
    expect(painted().has(light.ink)).toBe(true);

    // The system turns dark while the map is open. Nothing else changes:
    // the same stage, still mounted, draws again.
    mockRecorded.length = 0;
    setScheme('dark');
    await act(async () => tree.update(stage(darkModel)));
    expect(mockRecorded.length).toBeGreaterThan(0);
    expect(painted().has(SURFACE_DARK)).toBe(true);
    expect(painted().has(dark.ink)).toBe(true);
    // No picture from the light map is left: no paper rim, no dark halo.
    expect(painted().has(SURFACE)).toBe(false);
    expect(painted().has(light.ink)).toBe(false);
    for (const hex of painted())
      if (hex !== SURFACE_DARK)
        expect(contrastRatio(hex, SURFACE_DARK)).toBeGreaterThanOrEqual(3);

    // And back.
    mockRecorded.length = 0;
    setScheme('light');
    await act(async () => tree.update(stage(lightModel)));
    expect(painted().has(SURFACE)).toBe(true);
    expect(painted().has(SURFACE_DARK)).toBe(false);
    await act(async () => tree.unmount());
  });

  test('the stage does not paint a ground of its own on the dark map', async () => {
    setScheme('dark');
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(stage(darkModel));
    });
    const style = Native.StyleSheet.flatten(
      tree.root.findByProps({ testID: 'money-map-stage' }).props.style,
    );
    // The page's own paper shows through; only the sheet fallback paints.
    expect(style.backgroundColor).toBeUndefined();
    await act(async () => tree.unmount());
  });
});
