import {
  Group,
  Picture,
  useCanvasRef,
  type SkPicture,
} from '@shopify/react-native-skia';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { useReduceMotion } from '../../../design/accessibility';
import { SizedCanvas } from '../../../design/canvas';
import { paletteFor } from '../../../design/palette';
import { motion } from '../../../design/tokens';
import type { MoneyGraph } from '../data';
import { useMoneyMapPerf, useMoneyMapProbe } from '../money-probe';
import {
  ZOOM_IN,
  ZOOM_OUT,
  ZOOM_STEP,
  cameraAt,
  clampCamera,
  fitCamera,
  focusScale,
  smallNodeOpacity,
  thinEdgeOpacity,
  translationRange,
  zoomAbout,
  type Camera,
  type Insets,
  type Viewport,
} from './camera';
import { HitGrid } from './hit';
import { labelSlots, visibleLabels, type LabelSlot } from './labels';
import {
  layoutBounds,
  layoutFor,
  type Bounds,
  type ForceLayout,
} from './layout';
import { MiniMap } from './MiniMap';
import type { MapModel } from './model';
import { LABEL_HEIGHT, LABEL_WIDTH, MoneyMapLabels } from './MoneyMapLabels';
import { paintEdges, paintFocus, paintNodes } from './scene';
import { recordPicture } from './skia-painter';

/**
 * What the chrome asks the camera to do, as state (a new `seq` runs it):
 * show the whole map, step the zoom, or fly to a disc.
 */
export type MapRequest =
  | { type: 'fit' }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'flyTo'; id: string };
export type MapCommand = MapRequest & { seq: number };
export interface MoneyMapAction extends AccessibilityActionInfo {
  onAction: () => void;
}
export interface MoneyMapProps {
  /** The whole jurisdiction's graph: the layout holds every node of it. */
  graph: MoneyGraph;
  /** The filtered view as marks: what is drawn. */
  model: MapModel;
  focus: string | null;
  onFocus: (id: string | null) => void;
  /** How far the floating chrome covers each edge, in points. */
  insets: Insets;
  /** Where the camera is kept between visits (a jurisdiction). */
  cacheKey: string;
  accessibilityLabel: string;
  /** Actions beyond the stage's own zoom in, zoom out and fit. */
  actions?: readonly MoneyMapAction[];
  /** Where the overview sits (points from the leading and bottom edges), or none. */
  overview?: { left: number; bottom: number } | null;
  onReady?: (state: { nodes: number; edges: number }) => void;
  children?: React.ReactNode;
  command?: MapCommand | null;
}

/** The camera a reader left each jurisdiction at. */
const cameras = new Map<string, Camera>();
export function forgetCameras() {
  cameras.clear();
}

/** Ticks per frame while the layout settles: a short glide into place. */
const TICKS_PER_FRAME = 10;
/** A tap allowance around a disc's rim, in points. */
const TAP_SLACK = 14;
const FLY_MS = motion.duration.launchLatest;
const DIM = 0.2;
const fill = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

/** The layout as the stage reads it: settled, or still gliding. */
function useSettledLayout(layout: ForceLayout, reduced: boolean) {
  const [generation, setGeneration] = useState(0);
  const [settledLayout, setSettledLayout] = useState<ForceLayout | null>(
    layout.settled ? layout : null,
  );
  useEffect(() => {
    if (layout.settled) return;
    let frame: number | null = null,
      cancelled = false;
    const run = () => {
      if (cancelled) return;
      const done = layout.tick(reduced ? 400 : TICKS_PER_FRAME);
      setGeneration((n) => n + 1);
      if (done) setSettledLayout(layout);
      else frame = requestAnimationFrame(run);
    };
    frame = requestAnimationFrame(run);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [layout, reduced]);
  return { generation, settled: layout.settled || settledLayout === layout };
}

export function MoneyMap({
  graph,
  model,
  focus,
  onFocus,
  insets,
  cacheKey,
  accessibilityLabel,
  actions = [],
  overview = null,
  onReady,
  children,
  command = null,
}: MoneyMapProps) {
  const reduced = useReduceMotion();
  const palette = paletteFor('light');
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const canvasRef = useCanvasRef();

  // ---- layout and model ------------------------------------------------
  const aspect = window.width / Math.max(1, window.height - 200);
  const layout = layoutFor(graph, aspect);
  const { generation, settled } = useSettledLayout(layout, reduced);
  const layoutIndex = useMemo(
    () => new Map(graph.nodes.map((n, i) => [n.id, i])),
    [graph],
  );
  const toLayout = useMemo(
    () => model.nodes.map((n) => layoutIndex.get(n.id) ?? 0),
    [model, layoutIndex],
  );
  const at = useCallback(
    (i: number) => {
      const li = toLayout[i] ?? 0;
      return { x: layout.x[li] ?? 0, y: layout.y[li] ?? 0 };
    },
    [layout, toLayout],
  );
  // Positions move while the layout settles: `generation` names each step.
  const bounds: Bounds = useMemo(() => {
    void generation;
    return layoutBounds(layout, toLayout);
  }, [layout, toLayout, generation]);
  const focusIndex = focus === null ? null : (model.byId.get(focus) ?? null);

  // ---- pictures ----------------------------------------------------------
  const pictures = useMemo(() => {
    const record = (paint: Parameters<typeof recordPicture>[1]) =>
      recordPicture(bounds, paint);
    return {
      thinEdges: record((p) => paintEdges(p, model, at, 'thin')),
      thickEdges: record((p) => paintEdges(p, model, at, 'thick')),
      smallNodes: record((p) =>
        paintNodes(p, model, at, 'small', palette.paper),
      ),
      largeNodes: record((p) =>
        paintNodes(p, model, at, 'large', palette.paper),
      ),
    };
  }, [model, at, bounds, palette.paper]);
  const focusPicture: SkPicture | null = useMemo(
    () =>
      focusIndex === null
        ? null
        : recordPicture(bounds, (p) =>
            paintFocus(p, model, at, focusIndex, palette.ink, palette.paper),
          ),
    [focusIndex, model, at, bounds, palette.ink, palette.paper],
  );
  const slots: LabelSlot[] = useMemo(() => {
    void bounds;
    return labelSlots(model, layout.centres, at, focusIndex);
  }, [model, layout.centres, at, focusIndex, bounds]);
  // Picking uses the drawn discs: the model's radii, at the layout's places.
  const hit = useMemo(() => {
    void bounds;
    const xs = model.nodes.map((n) => at(n.index).x);
    const ys = model.nodes.map((n) => at(n.index).y);
    const radii = model.nodes.map((n) => n.radius);
    return new HitGrid(
      xs,
      ys,
      radii,
      model.nodes.map((n) => n.index),
    );
  }, [model, at, bounds]);
  useEffect(() => {
    if (settled)
      onReady?.({ nodes: model.nodes.length, edges: model.edges.length });
  }, [settled, model, onReady]);

  // ---- camera ------------------------------------------------------------
  const tx = useSharedValue(0),
    ty = useSharedValue(0),
    k = useSharedValue(1),
    fitK = useSharedValue(1);
  const viewportSV = useSharedValue<Viewport>({
    width: 1,
    height: 1,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  const boundsSV = useSharedValue<Bounds>(bounds);
  const placed = useRef(false);
  const viewport: Viewport = useMemo(
    () => ({ width: size.width, height: size.height, insets }),
    [size.width, size.height, insets],
  );
  useEffect(() => {
    if (!size.width || !size.height) return;
    const fit = fitCamera(bounds, viewport);
    viewportSV.set(viewport);
    boundsSV.set(bounds);
    fitK.set(fit.k);
    const kMin = fit.k * ZOOM_OUT,
      kMax = fit.k * ZOOM_IN;
    let next: Camera;
    if (!placed.current) {
      placed.current = true;
      const kept = cameras.get(cacheKey);
      next = kept ? clampCamera(kept, bounds, viewport, kMin, kMax) : fit;
    } else
      // The chrome or the window changed: keep the view, inside the limits.
      next = clampCamera(
        { tx: tx.get(), ty: ty.get(), k: k.get() },
        bounds,
        viewport,
        kMin,
        kMax,
      );
    tx.set(next.tx);
    ty.set(next.ty);
    k.set(next.k);
  }, [
    bounds,
    viewport,
    size.width,
    size.height,
    cacheKey,
    tx,
    ty,
    k,
    fitK,
    viewportSV,
    boundsSV,
  ]);
  // Keep the camera for the next visit.
  const remember = useCallback(() => {
    if (placed.current)
      cameras.set(cacheKey, { tx: tx.get(), ty: ty.get(), k: k.get() });
  }, [cacheKey, tx, ty, k]);
  useFocusEffect(useCallback(() => remember, [remember]));
  useEffect(() => remember, [remember]);

  const animateTo = useCallback(
    (target: Camera) => {
      const next = clampCamera(
        target,
        boundsSV.get(),
        viewportSV.get(),
        fitK.get() * ZOOM_OUT,
        fitK.get() * ZOOM_IN,
      );
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(k);
      if (reduced) {
        tx.set(next.tx);
        ty.set(next.ty);
        k.set(next.k);
        return;
      }
      const config = {
        duration: FLY_MS,
        easing: Easing.bezier(...motion.easing.standard),
      };
      tx.set(withTiming(next.tx, config));
      ty.set(withTiming(next.ty, config));
      k.set(withTiming(next.k, config));
    },
    [reduced, tx, ty, k, fitK, boundsSV, viewportSV],
  );
  const current = useCallback(
    (): Camera => ({ tx: tx.get(), ty: ty.get(), k: k.get() }),
    [tx, ty, k],
  );
  const fit = useCallback(
    () => animateTo(fitCamera(boundsSV.get(), viewportSV.get())),
    [animateTo, boundsSV, viewportSV],
  );
  const zoom = useCallback(
    (direction: 1 | -1) => {
      const v = viewportSV.get();
      const cx = v.insets.left + (v.width - v.insets.left - v.insets.right) / 2;
      const cy = v.insets.top + (v.height - v.insets.top - v.insets.bottom) / 2;
      animateTo(
        zoomAbout(
          current(),
          direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP,
          cx,
          cy,
          fitK.get() * ZOOM_OUT,
          fitK.get() * ZOOM_IN,
        ),
      );
    },
    [animateTo, current, fitK, viewportSV],
  );
  const flyTo = useCallback(
    (id: string) => {
      const index = model.byId.get(id);
      if (index === undefined) return;
      const p = at(index);
      animateTo(
        cameraAt(
          current(),
          p.x,
          p.y,
          viewportSV.get(),
          focusScale(k.get(), fitK.get()),
        ),
      );
    },
    [model, at, animateTo, current, viewportSV, k, fitK],
  );
  const centreOn = useCallback(
    (x: number, y: number) =>
      animateTo(cameraAt(current(), x, y, viewportSV.get())),
    [animateTo, current, viewportSV],
  );
  const ran = useRef(0);
  useEffect(() => {
    if (!command || command.seq === ran.current) return;
    ran.current = command.seq;
    if (command.type === 'fit') fit();
    else if (command.type === 'zoom') zoom(command.direction);
    else flyTo(command.id);
  }, [command, fit, zoom, flyTo]);
  const pick = useCallback(
    (sx: number, sy: number) => {
      const cam = current();
      const world = { x: (sx - cam.tx) / cam.k, y: (sy - cam.ty) / cam.k };
      const mi = hit.pick(world.x, world.y, TAP_SLACK / cam.k);
      onFocus(mi === null ? null : (model.nodes[mi]?.id ?? null));
    },
    [current, hit, model, onFocus],
  );

  // ---- gestures (UI thread) ---------------------------------------------
  // One state for pan and pinch together: the camera at the last rebase,
  // the pinch scale and focal point since, and the pan since. Each handler
  // starting or ending while the other continues rebases, so the two never
  // fight over the translation.
  const gesture = useSharedValue({
    active: 0,
    baseTx: 0,
    baseTy: 0,
    baseK: 1,
    scale: 1,
    scaleOrigin: 1,
    lastScale: 1,
    fx: 0,
    fy: 0,
    panX: 0,
    panY: 0,
    panOriginX: 0,
    panOriginY: 0,
    lastPanX: 0,
    lastPanY: 0,
  });
  const rebase = () => {
    'worklet';
    const s = gesture.get();
    gesture.set({
      ...s,
      baseTx: tx.get(),
      baseTy: ty.get(),
      baseK: k.get(),
      scale: 1,
      scaleOrigin: s.lastScale,
      panX: 0,
      panY: 0,
      panOriginX: s.lastPanX,
      panOriginY: s.lastPanY,
    });
  };
  const apply = () => {
    'worklet';
    const s = gesture.get();
    const kMin = fitK.get() * ZOOM_OUT,
      kMax = fitK.get() * ZOOM_IN;
    const z = zoomAbout(
      { tx: s.baseTx, ty: s.baseTy, k: s.baseK },
      s.scale,
      s.fx,
      s.fy,
      kMin,
      kMax,
    );
    const c = clampCamera(
      { tx: z.tx + s.panX, ty: z.ty + s.panY, k: z.k },
      boundsSV.get(),
      viewportSV.get(),
      kMin,
      kMax,
    );
    tx.set(c.tx);
    ty.set(c.ty);
    k.set(c.k);
  };
  const begin = () => {
    'worklet';
    if (gesture.get().active === 0) {
      cancelAnimation(tx);
      cancelAnimation(ty);
      cancelAnimation(k);
    }
    rebase();
    gesture.set({ ...gesture.get(), active: gesture.get().active + 1 });
  };
  const finish = () => {
    'worklet';
    gesture.set({
      ...gesture.get(),
      active: Math.max(0, gesture.get().active - 1),
    });
    if (gesture.get().active > 0) rebase();
  };
  const pan = Gesture.Pan()
    .maxPointers(2)
    .averageTouches(true)
    .activeOffsetX([-4, 4])
    .activeOffsetY([-4, 4])
    .onStart(() => {
      gesture.set({ ...gesture.get(), lastPanX: 0, lastPanY: 0 });
      begin();
    })
    .onUpdate((e) => {
      const s = gesture.get();
      gesture.set({
        ...s,
        lastPanX: e.translationX,
        lastPanY: e.translationY,
        panX: e.translationX - s.panOriginX,
        panY: e.translationY - s.panOriginY,
      });
      apply();
    })
    .onEnd((e) => {
      finish();
      if (gesture.get().active > 0 || reduced) return;
      // The flick: momentum inside the map's own range.
      const range = translationRange(k.get(), boundsSV.get(), viewportSV.get());
      tx.set(
        withDecay({
          velocity: e.velocityX,
          clamp: range.x,
          rubberBandEffect: true,
        }),
      );
      ty.set(
        withDecay({
          velocity: e.velocityY,
          clamp: range.y,
          rubberBandEffect: true,
        }),
      );
    });
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      gesture.set({
        ...gesture.get(),
        lastScale: 1,
        fx: e.focalX,
        fy: e.focalY,
      });
      begin();
    })
    .onUpdate((e) => {
      const s = gesture.get();
      gesture.set({
        ...s,
        lastScale: e.scale,
        scale: e.scale / s.scaleOrigin,
      });
      apply();
    })
    .onEnd(() => {
      finish();
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd((e) => {
      const kMin = fitK.get() * ZOOM_OUT,
        kMax = fitK.get() * ZOOM_IN;
      const target = clampCamera(
        zoomAbout(
          { tx: tx.get(), ty: ty.get(), k: k.get() },
          ZOOM_STEP,
          e.x,
          e.y,
          kMin,
          kMax,
        ),
        boundsSV.get(),
        viewportSV.get(),
        kMin,
        kMax,
      );
      if (reduced) {
        tx.set(target.tx);
        ty.set(target.ty);
        k.set(target.k);
      } else {
        const config = {
          duration: FLY_MS,
          easing: Easing.bezier(...motion.easing.standard),
        };
        tx.set(withTiming(target.tx, config));
        ty.set(withTiming(target.ty, config));
        k.set(withTiming(target.k, config));
      }
    });
  const tap = Gesture.Tap()
    .maxDuration(260)
    .onEnd((e) => {
      runOnJS(pick)(e.x, e.y);
    });
  const composed = Gesture.Race(
    Gesture.Exclusive(doubleTap, tap),
    Gesture.Simultaneous(pan, pinch),
  );

  // ---- derived drawing values -------------------------------------------
  const transform = useDerivedValue(() => [
    { translateX: tx.value },
    { translateY: ty.value },
    { scale: k.value },
  ]);
  const level = useDerivedValue(() => k.value / Math.max(1e-6, fitK.value));
  const smallOpacity = useDerivedValue(() => smallNodeOpacity(level.value));
  const thinOpacity = useDerivedValue(() => thinEdgeOpacity(level.value));
  const dim = useSharedValue(1);
  useEffect(() => {
    const target = focusIndex === null ? 1 : DIM;
    dim.set(
      reduced
        ? target
        : withTiming(target, { duration: motion.duration.crossfade }),
    );
  }, [focusIndex, reduced, dim]);
  const allowed = useSharedValue<Record<string, 1>>({});
  const { fontScale } = window;
  const box = useMemo(
    () => ({
      width: LABEL_WIDTH * Math.min(fontScale, 1.6),
      height: LABEL_HEIGHT * Math.min(fontScale, 1.6),
    }),
    [fontScale],
  );
  useAnimatedReaction(
    () => ({ tx: tx.value, ty: ty.value, k: k.value }),
    (camera) => {
      allowed.value = visibleLabels(slots, camera, viewportSV.value, box);
    },
    [slots, box],
  );
  // Reduce Motion stops the flick (no decay) and every fly is a cut; a pan
  // or pinch still follows the finger, as a scroll view does.

  // ---- probes (e2e builds only) ----------------------------------------
  const probe = useMoneyMapProbe(canvasRef, settled && size.width > 0);
  const perf = useMoneyMapPerf(tx, ty, k);

  // ---- accessibility -----------------------------------------------------
  const own: MoneyMapAction[] = useMemo(
    () => [
      { name: 'zoomIn', label: 'Zoom in', onAction: () => zoom(1) },
      { name: 'zoomOut', label: 'Zoom out', onAction: () => zoom(-1) },
      { name: 'fit', label: 'Show the whole map', onAction: fit },
    ],
    [zoom, fit],
  );
  const all = useMemo(() => [...own, ...actions], [own, actions]);
  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      all.find((a) => a.name === event.nativeEvent.actionName)?.onAction();
    },
    [all],
  );
  const accessibilityActions = useMemo(
    () => all.map(({ name, label }) => ({ name, label })),
    [all],
  );

  return (
    <View
      style={styles.stage}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((previous) =>
          previous.width === width && previous.height === height
            ? previous
            : { width, height },
        );
      }}
      testID="money-map-stage"
    >
      <GestureDetector gesture={composed}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={accessibilityLabel}
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
          testID={probe}
          style={[
            styles.fill,
            // Android's predictive back owns the leading edge.
            Platform.OS === 'android' ? styles.androidEdge : null,
          ]}
        >
          <SizedCanvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            style={styles.fill}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Group transform={transform}>
              <Group opacity={dim}>
                <Group opacity={thinOpacity}>
                  <Picture picture={pictures.thinEdges} />
                </Group>
                <Picture picture={pictures.thickEdges} />
                <Group opacity={smallOpacity}>
                  <Picture picture={pictures.smallNodes} />
                </Group>
                <Picture picture={pictures.largeNodes} />
              </Group>
              {focusPicture ? <Picture picture={focusPicture} /> : null}
            </Group>
          </SizedCanvas>
          {size.width > 0 ? (
            <MoneyMapLabels
              slots={slots}
              tx={tx}
              ty={ty}
              k={k}
              fitK={fitK}
              allowed={allowed}
              width={size.width}
            />
          ) : null}
        </View>
      </GestureDetector>
      {overview && size.width > 0 ? (
        <View
          style={[
            styles.overview,
            { left: overview.left, bottom: overview.bottom },
          ]}
          pointerEvents="box-none"
        >
          <MiniMap
            model={model}
            centres={layout.centres}
            bounds={bounds}
            tx={tx}
            ty={ty}
            k={k}
            stage={size}
            onJump={centreOn}
          />
        </View>
      ) : null}
      {perf}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { ...fill, overflow: 'hidden' },
  fill,
  androidEdge: { left: 24 },
  overview: { position: 'absolute' },
});
