import { act } from 'react';
import { rhythm } from '../src/design/tokens';
import { RELEARN_MS } from '../src/features/today/australia-dots-model';
import {
  advance,
  expectAtRest,
  installDotHarness,
  mount,
  scrollTo,
  windowOf,
} from './today-dots-harness';

/**
 * Lane ad-home-map-rotation (14 Nov), iPad: Today's map hangs 8 pt past the
 * scroll view's leading edge. In landscape the iPadOS 26 sidebar stays open
 * and pads the scroll view's leading side (SidebarSafe), so the scroll view
 * is narrower than the window. The art was placed from the window's width
 * and slid half the sidebar's width further out, under the sidebar and
 * clipped: on turning to landscape it disappeared. The bars are the same
 * height in both orientations, so the rest inset carries over.
 */

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return Object.defineProperties(Object.create(actual), {
    Platform: { value: { ...actual.Platform, OS: 'ios', isPad: true } },
  });
});
jest.mock('../modules/opax-duo', () => ({
  OpaxDuo: null,
  ReservedRegionView: null,
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn(), setParams: jest.fn() }),
  useSegments: () => [],
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), setParams: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('../src/design/accessibility', () => ({
  ...jest.requireActual('../src/design/accessibility'),
  useReduceMotionSetting: () => false,
}));

installDotHarness();

// 13-inch iPad: 1032 by 1376. The sidebar takes about 320 pt in landscape.
const portrait = { width: 1032, height: 1376 };
const landscape = { width: 1376, height: 1032 };
const sidebar = 320;
const bar = 126;

test('iPad portrait, landscape with the sidebar, back, and a Stage Manager resize', () => {
  const view = mount(portrait, bar);
  view.layOut(portrait.width, portrait.height);
  view.rest(bar);
  expectAtRest(view, bar);
  expect(view.art().left).toBe(-8 - view.gutter());
  expect(view.art().left).toBe(-40);

  // Landscape: the scroll view starts after the sidebar.
  advance(100);
  view.turn(landscape);
  view.layOut(landscape.width - sidebar, landscape.height);
  advance(2000);
  expectAtRest(view, bar);
  // 8 pt past the scroll view's edge, not 160 pt (half the sidebar) more.
  expect(view.art().left).toBe(-8 - view.gutter());
  expect(view.art().left).toBe(-40);

  advance(2000);
  view.turn(portrait);
  view.layOut(portrait.width, portrait.height);
  expectAtRest(view, bar);
  expect(view.art().left).toBe(-8 - view.gutter());
  expect(view.art().left).toBe(-40);

  // Stage Manager: a 600 pt window, compact, no sidebar.
  advance(2000);
  act(() => windowOf({ width: 600, height: 900 }));
  view.layOut(600, 900);
  expectAtRest(view, bar);
  expect(view.gutter()).toBe(20);
  expect(view.art().left).toBe(-8 - 20);
  act(() => view.tree.unmount());
});

test('iPad turned while a record covers Today: the bar keeps its height and the inset', () => {
  const view = mount(portrait, bar);
  view.layOut(portrait.width, portrait.height);
  view.rest(bar);
  expectAtRest(view, bar);
  view.cover();
  advance(100);
  view.turn(landscape);
  view.layOut(landscape.width - sidebar, landscape.height);
  advance(8000);
  // The bar is the same height in landscape: nothing is reported.
  view.show();
  expectAtRest(view, bar);
  expect(view.art().left).toBe(-40);
  // A second after the focus, the collapse as Today scrolls leaves the inset.
  advance(RELEARN_MS + 1);
  view.header(74);
  scrollTo(-bar + 40);
  expect(view.art().top).toBe(30 - bar - rhythm.block);
  expect(Math.min(...view.rows())).toBeLessThan(1);
  view.rest(bar);
  view.header(bar);
  expectAtRest(view, bar);
  act(() => view.tree.unmount());
});
