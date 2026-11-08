import { act } from 'react';
import { StyleSheet, View } from 'react-native';
import TestRenderer from 'react-test-renderer';
import {
  canvasBox,
  MAX_CANVAS_POINTS,
  SizedCanvas,
} from '../src/design/canvas';

// Skia makes a Metal texture of the view's size. A NaN, infinite, negative or
// unbounded size is a texture Metal refuses by aborting the app (build 36's
// seat launch), so no Canvas is mounted until it has a finite, positive box.
describe('canvasBox', () => {
  test.each([
    [0, 120],
    [370, 0],
    [NaN, 120],
    [370, NaN],
    [Infinity, 120],
    [370, -Infinity],
    [-1, -1],
    [-0.5, 120],
  ])('refuses %p by %p', (width, height) => {
    expect(canvasBox(width, height)).toBeNull();
  });

  test('passes a finite positive box through unchanged', () => {
    expect(canvasBox(370, 120)).toEqual({ width: 370, height: 120 });
    expect(canvasBox(0.5, 0.5)).toEqual({ width: 0.5, height: 0.5 });
  });

  test('clamps both sides to the limit and to the device ceiling', () => {
    expect(canvasBox(9000, 120, 402)).toEqual({ width: 402, height: 120 });
    expect(canvasBox(370, 1e9)).toEqual({
      width: 370,
      height: MAX_CANVAS_POINTS,
    });
    expect(canvasBox(1e12, 1e12)).toEqual({
      width: MAX_CANVAS_POINTS,
      height: MAX_CANVAS_POINTS,
    });
    // A nonsense limit never widens the ceiling or refuses the box.
    expect(canvasBox(370, 120, NaN)).toEqual({ width: 370, height: 120 });
    expect(canvasBox(370, 120, 0)).toEqual({ width: 370, height: 120 });
  });
});

describe('SizedCanvas', () => {
  const render = (element: React.ReactElement) => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(element);
    });
    return renderer;
  };
  const canvases = (renderer: TestRenderer.ReactTestRenderer) =>
    renderer.root
      .findAllByType(View)
      .filter((node) => node.props.testID === 'c');

  test('mounts nothing until both sides are finite and positive', () => {
    for (const [width, height] of [
      [0, 120],
      [NaN, 120],
      [370, Infinity],
    ])
      expect(
        canvases(
          render(
            <SizedCanvas testID="c" width={width!} height={height!}>
              <View />
            </SizedCanvas>,
          ),
        ),
      ).toHaveLength(0);
  });

  test('mounts the canvas at the bounded box, keeping the given style', () => {
    const tree = render(
      <SizedCanvas
        testID="c"
        width={9000}
        height={120}
        limit={402}
        style={{ opacity: 0.5 }}
      >
        <View testID="child" />
      </SizedCanvas>,
    );
    const [canvas] = canvases(tree);
    expect(canvas).toBeDefined();
    expect(StyleSheet.flatten(canvas!.props.style)).toEqual({
      opacity: 0.5,
      width: 402,
      height: 120,
    });
    expect(
      tree.root.findAll((n) => n.props.testID === 'child'),
    ).not.toHaveLength(0);
  });
});
