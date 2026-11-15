import { act } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { GroundFade } from '../src/design/ground-fade';
import { ListPaneFade } from '../src/design/split';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Build 87, iPad on iOS 27.2: a split's list pane has no bar of its own, so
// its scrolled rows showed behind the status bar's clock (the Bills list).
// The pane's ground now covers from the top edge to the bar's foot.

function fade(os: 'ios' | 'android', version: number, foot = 74) {
  jest.replaceProperty(Platform, 'OS', os);
  const before = Object.getOwnPropertyDescriptor(Platform, 'Version')!;
  Object.defineProperty(Platform, 'Version', {
    configurable: true,
    value: version,
  });
  let renderer!: TestRenderer.ReactTestRenderer;
  try {
    act(() => {
      renderer = TestRenderer.create(
        <HeaderHeightContext.Provider value={foot}>
          <ListPaneFade />
        </HeaderHeightContext.Provider>,
      );
    });
    const layer = renderer.root.findAll(
      (n) => n.type === View && n.props.testID === 'split-list-fade',
    )[0];
    const read = layer && {
      style: StyleSheet.flatten(layer.props.style),
      touches: layer.props.pointerEvents,
      hold: layer.findByType(GroundFade).props.hold as number,
      side: layer.findByType(GroundFade).props.side,
    };
    act(() => renderer.unmount());
    return read;
  } finally {
    Object.defineProperty(Platform, 'Version', before);
  }
}

test('under the clear bar the pane’s ground is whole to just above the bar’s foot and clear just below it', () => {
  const read = fade('ios', 26)!;
  // From the pane's top edge, over the status bar and the bar.
  expect(read.style).toMatchObject({
    position: 'absolute',
    top: 0,
    height: 90,
  });
  expect(read.side).toBe('top');
  // Whole down to 12 pt above the 74 pt foot, gone 16 pt below it.
  expect(read.hold * read.style.height).toBeCloseTo(62);
  // It never takes a touch from the rows or the bar.
  expect(read.touches).toBe('none');
});

test('it follows the bar the stack reports, with nothing tied to scrolling', () => {
  expect(fade('ios', 26, 116)!.style.height).toBe(132);
  const source = readFileSync(
    join(__dirname, '../src/design/split.tsx'),
    'utf8',
  );
  const body = source.slice(
    source.indexOf('export function ListPaneFade'),
    source.indexOf('/** The hairline between the panes'),
  );
  expect(body).not.toMatch(/onScroll|useState|Animated/);
});

test('below an opaque bar (before iOS 26, Android) there is no fade', () => {
  expect(fade('ios', 18)).toBeUndefined();
  expect(fade('android', 36)).toBeUndefined();
});

test('the split draws it in the list pane only when there are two panes', () => {
  const source = readFileSync(
    join(__dirname, '../src/design/split.tsx'),
    'utf8',
  );
  expect(source).toMatch(/\{twoPane \? <ListPaneFade \/> : null\}/);
});
