import {
  ZOOM_IN,
  ZOOM_OUT,
  cameraAt,
  clampCamera,
  clusterLabelOpacity,
  discInView,
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  isDoubleTap,
  publicEdgeOpacity,
  fitCamera,
  focusScale,
  LOD,
  nameOpacity,
  onScreen,
  placeCamera,
  ramp,
  returnCamera,
  screenToWorld,
  smallNodeOpacity,
  thinEdgeOpacity,
  translationRange,
  viewportCentre,
  worldToScreen,
  zoomAbout,
  type Bounds,
  type Camera,
  type CameraRest,
  type Viewport,
} from '../src/features/money/map/camera';

const viewport: Viewport = {
  width: 402,
  height: 700,
  insets: { top: 60, bottom: 180, left: 12, right: 12 },
};
const bounds: Bounds = { minX: -500, minY: -300, maxX: 700, maxY: 500 };

describe('fitCamera', () => {
  test('fits the whole box inside the inset viewport, centred, at the margin', () => {
    const camera = fitCamera(bounds, viewport);
    const tl = worldToScreen(camera, bounds.minX, bounds.minY);
    const br = worldToScreen(camera, bounds.maxX, bounds.maxY);
    const { insets } = viewport;
    expect(tl.x).toBeGreaterThanOrEqual(insets.left - 1e-9);
    expect(tl.y).toBeGreaterThanOrEqual(insets.top - 1e-9);
    expect(br.x).toBeLessThanOrEqual(viewport.width - insets.right + 1e-9);
    expect(br.y).toBeLessThanOrEqual(viewport.height - insets.bottom + 1e-9);
    // The box centre lands on the inset viewport's centre.
    const centre = worldToScreen(camera, 100, 100);
    expect(centre.x).toBeCloseTo(viewportCentre(viewport).x, 9);
    expect(centre.y).toBeCloseTo(viewportCentre(viewport).y, 9);
    // The binding axis (width here) takes the margin share of the room.
    const innerW = viewport.width - insets.left - insets.right;
    expect((br.x - tl.x) / innerW).toBeCloseTo(0.92, 9);
  });

  test('a margin of 1 fills the binding axis exactly; a smaller margin shrinks k in proportion', () => {
    const full = fitCamera(bounds, viewport, 1);
    const half = fitCamera(bounds, viewport, 0.5);
    expect(half.k).toBeCloseTo(full.k / 2, 12);
    const tl = worldToScreen(full, bounds.minX, bounds.minY);
    expect(tl.x).toBeCloseTo(viewport.insets.left, 9);
  });

  test('a tall box binds on height', () => {
    const tall: Bounds = { minX: 0, minY: 0, maxX: 10, maxY: 1000 };
    const camera = fitCamera(tall, viewport, 1);
    const innerH =
      viewport.height - viewport.insets.top - viewport.insets.bottom;
    expect(camera.k).toBeCloseTo(innerH / 1000, 12);
  });

  test('a degenerate box or viewport stays finite', () => {
    const camera = fitCamera(
      { minX: 5, minY: 5, maxX: 5, maxY: 5 },
      { width: 0, height: 0, insets: { top: 0, bottom: 0, left: 0, right: 0 } },
    );
    expect(Number.isFinite(camera.k)).toBe(true);
    expect(camera.k).toBeGreaterThan(0);
    expect(Number.isFinite(camera.tx)).toBe(true);
    expect(Number.isFinite(camera.ty)).toBe(true);
  });
});

test('worldToScreen and screenToWorld are inverses', () => {
  const camera: Camera = { k: 2.37, tx: -41.5, ty: 133.25 };
  for (const [x, y] of [
    [0, 0],
    [123.4, -56.7],
    [-1000, 999],
  ] as const) {
    const s = worldToScreen(camera, x, y);
    const w = screenToWorld(camera, s.x, s.y);
    expect(w.x).toBeCloseTo(x, 9);
    expect(w.y).toBeCloseTo(y, 9);
  }
  expect(worldToScreen(camera, 10, 20)).toEqual({
    x: 10 * 2.37 - 41.5,
    y: 20 * 2.37 + 133.25,
  });
});

describe('zoomAbout', () => {
  const camera: Camera = { k: 1.5, tx: 30, ty: -20 };
  test('keeps the focal world point under the same screen point', () => {
    const fx = 180,
      fy = 260;
    const before = screenToWorld(camera, fx, fy);
    const next = zoomAbout(camera, 1.8, fx, fy, 0.1, 50);
    expect(next.k).toBeCloseTo(1.5 * 1.8, 12);
    const after = screenToWorld(next, fx, fy);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  test('clamps k to [kMin, kMax] and still keeps the focal point fixed', () => {
    const fx = 90,
      fy = 400;
    const before = screenToWorld(camera, fx, fy);
    const high = zoomAbout(camera, 100, fx, fy, 0.5, 4);
    expect(high.k).toBe(4);
    const low = zoomAbout(camera, 0.001, fx, fy, 0.5, 4);
    expect(low.k).toBe(0.5);
    for (const c of [high, low]) {
      const after = screenToWorld(c, fx, fy);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  test('a factor of 1 leaves the camera as it is', () => {
    expect(zoomAbout(camera, 1, 10, 10, 0.1, 10)).toEqual(camera);
  });
});

describe('translationRange and clampCamera', () => {
  const { insets } = viewport;
  const left = insets.left,
    right = viewport.width - insets.right,
    top = insets.top,
    bottom = viewport.height - insets.bottom;
  const centreOnScreen = (c: Camera) =>
    worldToScreen(
      c,
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
    );

  test('at both ends of each range the box centre is still inside the inset viewport', () => {
    for (const k of [0.05, 0.3, 1, 4]) {
      const range = translationRange(k, bounds, viewport);
      expect(range.x[0]).toBeLessThanOrEqual(range.x[1]);
      expect(range.y[0]).toBeLessThanOrEqual(range.y[1]);
      for (const tx of range.x)
        for (const ty of range.y) {
          const c = centreOnScreen({ k, tx, ty });
          // The range widens by the half-extent so the box edge can reach
          // the viewport edge; the box itself always overlaps the viewport.
          const halfW = ((bounds.maxX - bounds.minX) / 2) * k;
          const halfH = ((bounds.maxY - bounds.minY) / 2) * k;
          expect(c.x + halfW).toBeGreaterThanOrEqual(left - 1e-9);
          expect(c.x - halfW).toBeLessThanOrEqual(right + 1e-9);
          expect(c.y + halfH).toBeGreaterThanOrEqual(top - 1e-9);
          expect(c.y - halfH).toBeLessThanOrEqual(bottom + 1e-9);
        }
    }
  });

  test('when the box is smaller than the viewport, its centre is held between the inset edges', () => {
    const k = 0.05;
    const range = translationRange(k, bounds, viewport);
    const lo = centreOnScreen({ k, tx: range.x[0], ty: range.y[0] });
    const hi = centreOnScreen({ k, tx: range.x[1], ty: range.y[1] });
    expect(lo.x).toBeCloseTo(left, 9);
    expect(lo.y).toBeCloseTo(top, 9);
    expect(hi.x).toBeCloseTo(right, 9);
    expect(hi.y).toBeCloseTo(bottom, 9);
  });

  test('clampCamera pulls a flung camera back so the centre stays in reach, and clamps k', () => {
    const flung = clampCamera(
      { k: 1, tx: 1e6, ty: -1e6 },
      bounds,
      viewport,
      0.2,
      3,
    );
    const range = translationRange(1, bounds, viewport);
    expect(flung.tx).toBe(range.x[1]);
    expect(flung.ty).toBe(range.y[0]);
    expect(
      clampCamera({ k: 99, tx: 0, ty: 0 }, bounds, viewport, 0.2, 3).k,
    ).toBe(3);
    expect(
      clampCamera({ k: 0.001, tx: 0, ty: 0 }, bounds, viewport, 0.2, 3).k,
    ).toBe(0.2);
  });

  test('clampCamera leaves a camera already in range alone', () => {
    const fit = fitCamera(bounds, viewport);
    expect(clampCamera(fit, bounds, viewport, fit.k * 0.6, fit.k * 14)).toEqual(
      fit,
    );
  });
});

test('cameraAt centres a world point, at the current or a given scale', () => {
  const camera: Camera = { k: 2, tx: 5, ty: 7 };
  const centre = viewportCentre(viewport);
  const same = cameraAt(camera, 120, -40, viewport);
  expect(same.k).toBe(2);
  expect(worldToScreen(same, 120, -40)).toEqual(centre);
  const closer = cameraAt(camera, 120, -40, viewport, 6);
  expect(closer.k).toBe(6);
  const p = worldToScreen(closer, 120, -40);
  expect(p.x).toBeCloseTo(centre.x, 9);
  expect(p.y).toBeCloseTo(centre.y, 9);
});

test('focusScale flies to at least 2.6 times the fit and never zooms out', () => {
  expect(focusScale(1, 1)).toBeCloseTo(2.6, 12);
  expect(focusScale(5, 1)).toBe(5);
  expect(focusScale(0.5, 2)).toBeCloseTo(5.2, 12);
});

describe('ramp and the level of detail', () => {
  test('ramp is 0 at and before `from`, 1 at and after `to`, a half at the midpoint, and rises monotonically', () => {
    expect(ramp(0, 1, 3)).toBe(0);
    expect(ramp(1, 1, 3)).toBe(0);
    expect(ramp(2, 1, 3)).toBeCloseTo(0.5, 12);
    expect(ramp(3, 1, 3)).toBe(1);
    expect(ramp(10, 1, 3)).toBe(1);
    let previous = -1;
    for (let level = 0.5; level <= 3.5; level += 0.05) {
      const v = ramp(level, 1, 3);
      expect(v).toBeGreaterThanOrEqual(previous);
      previous = v;
    }
  });

  test('small discs sit at 0.38 up to 0.7 and reach full strength by 2.0', () => {
    expect(LOD.smallNodes).toEqual([0.7, 2.0]);
    expect(smallNodeOpacity(0)).toBeCloseTo(0.38, 12);
    expect(smallNodeOpacity(0.7)).toBeCloseTo(0.38, 12);
    expect(smallNodeOpacity(1.35)).toBeCloseTo(0.38 + 0.62 / 2, 12);
    expect(smallNodeOpacity(2.0)).toBeCloseTo(1, 12);
    expect(smallNodeOpacity(9)).toBeCloseTo(1, 12);
  });

  test('thin lines sit at 0.25 up to 1.2 and reach full strength by 2.6', () => {
    expect(thinEdgeOpacity(1)).toBeCloseTo(0.25, 12);
    expect(thinEdgeOpacity(LOD.thinEdges[0])).toBeCloseTo(0.25, 12);
    expect(thinEdgeOpacity(LOD.thinEdges[1])).toBeCloseTo(1, 12);
    const mid = (LOD.thinEdges[0] + LOD.thinEdges[1]) / 2;
    expect(thinEdgeOpacity(mid)).toBeCloseTo(0.625, 12);
  });

  test('cluster names give way to node names as the reader zooms in', () => {
    expect(clusterLabelOpacity(1)).toBe(1);
    expect(clusterLabelOpacity(LOD.clusterLabels[0])).toBe(1);
    expect(clusterLabelOpacity(LOD.clusterLabels[1])).toBe(0);
    expect(clusterLabelOpacity(8)).toBe(0);
    expect(nameOpacity(1)).toBe(0);
    expect(nameOpacity(LOD.names[0])).toBe(0);
    expect(nameOpacity(LOD.names[1])).toBe(1);
    expect(nameOpacity(8)).toBe(1);
    // Names start fading in only after cluster names have begun to fade out.
    expect(LOD.names[0]).toBeGreaterThan(LOD.clusterLabels[0]);
  });
});

test('onScreen tests a screen point against the viewport, with an optional margin', () => {
  expect(onScreen(0, 0, viewport)).toBe(true);
  expect(onScreen(viewport.width, viewport.height, viewport)).toBe(true);
  expect(onScreen(-1, 10, viewport)).toBe(false);
  expect(onScreen(10, viewport.height + 1, viewport)).toBe(false);
  expect(onScreen(-1, 10, viewport, 4)).toBe(true);
  expect(onScreen(viewport.width + 5, 10, viewport, 4)).toBe(false);
});

describe('placeCamera', () => {
  // The layout's box while it is still settling: small, near the origin.
  const early: Bounds = { minX: -40, minY: -30, maxX: 60, maxY: 50 };
  const current: Camera = { tx: 1, ty: 2, k: 3 };

  test('follows the fit while the layout settles and stays unplaced', () => {
    const first = placeCamera(
      { placed: false, settled: false },
      { kept: current, current },
      early,
      viewport,
    );
    expect(first.placed).toBe(false);
    expect(first.camera).toEqual(fitCamera(early, viewport));
    // The box has grown: the view follows it rather than the early fit.
    const later = placeCamera(
      { placed: false, settled: false },
      { kept: current, current },
      bounds,
      viewport,
    );
    expect(later.placed).toBe(false);
    expect(later.camera).toEqual(fitCamera(bounds, viewport));
    expect(later.camera.k).toBeLessThan(first.camera.k);
  });

  test('once settled, places the fit when nothing is kept', () => {
    const placed = placeCamera(
      { placed: false, settled: true },
      { kept: null, current },
      bounds,
      viewport,
    );
    expect(placed.placed).toBe(true);
    expect(placed.camera).toEqual(fitCamera(bounds, viewport));
  });

  test('once settled, places the kept camera inside the settled limits', () => {
    const fit = fitCamera(bounds, viewport);
    const kept: Camera = { tx: 10, ty: 20, k: fit.k * 2 };
    const placed = placeCamera(
      { placed: false, settled: true },
      { kept, current },
      bounds,
      viewport,
    );
    expect(placed.placed).toBe(true);
    expect(placed.camera).toEqual(
      clampCamera(kept, bounds, viewport, fit.k * ZOOM_OUT, fit.k * ZOOM_IN),
    );
    // Far outside the limits, it is brought back in rather than taken as is.
    const far = placeCamera(
      { placed: false, settled: true },
      { kept: { tx: 0, ty: 0, k: fit.k * 100 }, current },
      bounds,
      viewport,
    );
    expect(far.camera.k).toBe(fit.k * ZOOM_IN);
  });

  test('after the placement, a chrome change keeps the current view inside the limits', () => {
    const fit = fitCamera(bounds, viewport);
    const kept = placeCamera(
      { placed: true, settled: true },
      { kept: null, current: { tx: 0, ty: 0, k: fit.k * 1.5 } },
      bounds,
      viewport,
    );
    expect(kept.placed).toBe(true);
    expect(kept.camera.k).toBe(fit.k * 1.5);
    const tooFar = placeCamera(
      { placed: true, settled: true },
      { kept: null, current: { tx: 0, ty: 0, k: fit.k * 0.1 } },
      bounds,
      viewport,
    );
    expect(tooFar.camera.k).toBe(fit.k * ZOOM_OUT);
  });
});

describe('discInView', () => {
  const viewport: Viewport = {
    width: 400,
    height: 800,
    insets: { top: 100, bottom: 200, left: 0, right: 60 },
  };
  const camera: Camera = { tx: 0, ty: 0, k: 1 };
  test('a disc wholly inside the insets is in view', () => {
    expect(discInView(camera, 200, 400, 10, viewport)).toBe(true);
    expect(discInView(camera, 200, 400, 10, viewport, 6)).toBe(true);
  });
  test('a disc under the chrome, or cut by an edge, is not', () => {
    // Under the panel.
    expect(discInView(camera, 200, 650, 10, viewport)).toBe(false);
    // Just over the panel's edge.
    expect(discInView(camera, 200, 595, 10, viewport)).toBe(false);
    expect(discInView(camera, 200, 589, 10, viewport)).toBe(true);
    // Under the card, and under the control stack.
    expect(discInView(camera, 200, 90, 10, viewport)).toBe(false);
    expect(discInView(camera, 350, 400, 10, viewport)).toBe(false);
    // The margin tightens the test.
    expect(discInView(camera, 200, 589, 10, viewport, 6)).toBe(false);
  });
  test('follows the camera', () => {
    const zoomed: Camera = { tx: -100, ty: -300, k: 2 };
    // World (150, 350) → screen (200, 400).
    expect(discInView(zoomed, 150, 350, 10, viewport)).toBe(true);
    // World (150, 460) → screen (200, 620): under the panel.
    expect(discInView(zoomed, 150, 460, 10, viewport)).toBe(false);
  });
});

test('public money lines are a haze at the fit and firm by the names level', () => {
  expect(publicEdgeOpacity(0.6)).toBeCloseTo(0.3, 9);
  expect(publicEdgeOpacity(1)).toBeCloseTo(0.3, 9);
  expect(publicEdgeOpacity(2.4)).toBeCloseTo(1, 9);
  expect(publicEdgeOpacity(5)).toBeCloseTo(1, 9);
  const mid = publicEdgeOpacity(1.7);
  expect(mid).toBeGreaterThan(0.3);
  expect(mid).toBeLessThan(1);
});

describe('isDoubleTap', () => {
  const first = { x: 100, y: 200, at: 1000 };
  test('a second tap inside the window and the slop is a double tap', () => {
    expect(
      isDoubleTap(first, { x: 104, y: 196, at: 1000 + DOUBLE_TAP_MS - 1 }),
    ).toBe(true);
    expect(isDoubleTap(first, { x: 100, y: 200, at: 1001 })).toBe(true);
  });
  test('too late, too far, or with no first tap, it is a single tap', () => {
    expect(
      isDoubleTap(first, { x: 100, y: 200, at: 1000 + DOUBLE_TAP_MS }),
    ).toBe(false);
    expect(
      isDoubleTap(first, { x: 100 + DOUBLE_TAP_SLOP, y: 200, at: 1050 }),
    ).toBe(false);
    expect(isDoubleTap(null, { x: 100, y: 200, at: 1050 })).toBe(false);
  });
  test('the window and the slop can be set', () => {
    expect(isDoubleTap(first, { x: 130, y: 200, at: 1400 }, 500, 40)).toBe(
      true,
    );
    expect(isDoubleTap(first, { x: 130, y: 200, at: 1400 }, 300, 40)).toBe(
      false,
    );
  });
});

describe('a viewport that changes and comes back', () => {
  const box: Bounds = { minX: -200, maxX: 200, minY: -300, maxY: 300 };
  const view = (top: number, height = 760): Viewport => ({
    width: 402,
    height,
    insets: { top, bottom: 196, left: 8, right: 76 },
  });
  /** What the stage does at each change: clamp to the moment's limits. */
  const clamp = (camera: Camera, viewport: Viewport) =>
    placeCamera(
      { placed: true, settled: true },
      { kept: null, current: camera },
      box,
      viewport,
    ).camera;
  /** One viewport change, through the clamp and the way back. */
  const change = (
    state: { camera: Camera; viewport: Viewport; rest: CameraRest | null },
    viewport: Viewport,
  ) => {
    const back = returnCamera(
      state.rest,
      { previous: state.viewport, current: state.camera },
      viewport,
      clamp(state.camera, viewport),
    );
    return { camera: back.camera, viewport, rest: back.rest };
  };
  const card = view(308);
  const search = view(98);
  const start = { camera: fitCamera(box, card), viewport: card, rest: null };

  test('the clamp alone leaves the map zoomed in after the search card', () => {
    // The search card gives the map more than 1 / ZOOM_OUT of its room.
    const opened = clamp(start.camera, search);
    expect(opened.k).toBeGreaterThan(start.camera.k);
    expect(clamp(opened, card)).not.toEqual(start.camera);
  });

  test('the view is put back exactly when the viewport returns', () => {
    const opened = change(start, search);
    expect(opened.camera.k).toBeGreaterThan(start.camera.k);
    const closed = change(opened, card);
    expect(closed.camera).toEqual(start.camera);
    // The chain stays until the reader moves the map: a later change that
    // comes back restores too.
    expect(closed.rest?.set).toEqual(start.camera);
  });

  test('through several changes: the keyboard resizes the window, then all of it returns', () => {
    let state = change(start, search);
    state = change(state, view(98, 440));
    state = change(state, view(308, 440));
    state = change(state, card);
    expect(state.camera).toEqual(start.camera);
  });

  test('a change that never comes back does not stop a later Search from restoring (reviewer P2)', () => {
    // A focus is cleared: the peek, and with it the viewport, changes for
    // good. Then Search opens and closes.
    const cleared = change(start, view(308, 760 + 120));
    const opened = change(cleared, search);
    expect(opened.camera.k).toBeGreaterThan(cleared.camera.k);
    const closed = change(opened, view(308, 760 + 120));
    expect(closed.camera).toEqual(cleared.camera);
  });

  test('a focus that changes with no fly ends the chain: nothing centred on the old one is restored', () => {
    const under =
      (focus: string | null) =>
      (
        state: { camera: Camera; viewport: Viewport; rest: CameraRest | null },
        viewport: Viewport,
      ) => {
        const back = returnCamera(
          state.rest,
          { previous: state.viewport, current: state.camera },
          viewport,
          clamp(state.camera, viewport),
          focus,
        );
        return { camera: back.camera, viewport, rest: back.rest };
      };
    // Under focus A the viewport changes and comes back: restored.
    const opened = under('A')(start, search);
    expect(under('A')(opened, card).camera).toEqual(start.camera);
    // The focus changes to B with the disc already in view: no fly, the
    // camera stays. The viewport then returns: the old pairs are not used.
    const refocused = under('B')(opened, view(98, 440));
    const back = under('B')(refocused, card);
    expect(back.camera).toEqual(clamp(refocused.camera, card));
    expect(back.camera).not.toEqual(start.camera);
  });

  test('a new chain that lands where it started keeps the clamp of the moment (reviewer P3)', () => {
    // Same viewport, but the limits moved (new bounds): not the old camera.
    const wide: Bounds = { minX: -20, maxX: 20, minY: -30, maxY: 30 };
    const current = fitCamera(box, card);
    const next = clampCamera(current, wide, card, 0.5, 0.6);
    const back = returnCamera(null, { previous: card, current }, card, next);
    expect(back.camera).toEqual(next);
    expect(back.rest).toBeNull();
  });

  test('a long chain keeps its latest pairs and still restores the latest', () => {
    let state = change(start, search);
    for (let i = 0; i < 12; i++) state = change(state, view(308 + i, 760 - i));
    const there = state.camera;
    state = change(state, search);
    state = change(state, view(308 + 11, 760 - 11));
    expect(state.camera).toEqual(there);
  });

  test('a view the reader moved in between is theirs: it is not put back', () => {
    const opened = change(start, search);
    const moved = { ...opened, camera: { ...opened.camera, tx: 40 } };
    const closed = change(moved, card);
    expect(closed.camera).toEqual(clamp(moved.camera, card));
    expect(closed.camera).not.toEqual(start.camera);
  });
});
