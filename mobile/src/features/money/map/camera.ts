/**
 * The camera: world → screen is `s = w · k + t`. Transforms are pure and
 * worklet-safe, so gesture handlers run them on the UI thread and tests on
 * Node. Reserved-region geometry is resolved on JS before gestures read it.
 */
import type { ReservedRegions } from '../../../design/fold';
import { mapRegions } from './regions';

export interface Camera {
  tx: number;
  ty: number;
  k: number;
}
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export interface Viewport {
  width: number;
  height: number;
  insets: Insets;
}

/** Encode the clear viewing side as insets so every camera action shares it. */
export function reservedViewport(
  viewport: Viewport,
  regions: ReservedRegions,
): Viewport {
  const { width, height, insets } = viewport;
  const { scene } = mapRegions(
    {
      x: insets.left,
      y: insets.top,
      width: Math.max(1, width - insets.left - insets.right),
      height: Math.max(1, height - insets.top - insets.bottom),
    },
    regions,
  );
  return {
    width,
    height,
    insets: {
      left: scene.x,
      top: scene.y,
      right: width - scene.x - scene.width,
      bottom: height - scene.y - scene.height,
    },
  };
}

/** Keep zoom and the reader's world focus through a display or chrome resize. */
export function resizeCamera(
  camera: Camera,
  previous: Viewport,
  next: Viewport,
  focus?: { x: number; y: number },
): Camera {
  const centre = viewportCentre(previous);
  const point = focus ?? screenToWorld(camera, centre.x, centre.y);
  return cameraAt(camera, point.x, point.y, next);
}

/** How far in and out of the fit a reader may go. */
export const ZOOM_OUT = 0.6;
export const ZOOM_IN = 14;
/** Zoom buttons and double-tap step by this factor. */
export const ZOOM_STEP = 1.8;

export function viewportCentre(viewport: Viewport) {
  'worklet';
  const { width, height, insets } = viewport;
  return {
    x: insets.left + (width - insets.left - insets.right) / 2,
    y: insets.top + (height - insets.top - insets.bottom) / 2,
  };
}

/** The camera that shows the whole box inside the viewport's insets. */
export function fitCamera(
  bounds: Bounds,
  viewport: Viewport,
  margin = 0.92,
): Camera {
  'worklet';
  const { width, height, insets } = viewport;
  const w = Math.max(1, width - insets.left - insets.right);
  const h = Math.max(1, height - insets.top - insets.bottom);
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  const k = Math.min(w / bw, h / bh) * margin;
  const centre = viewportCentre(viewport);
  return {
    k,
    tx: centre.x - ((bounds.minX + bounds.maxX) / 2) * k,
    ty: centre.y - ((bounds.minY + bounds.maxY) / 2) * k,
  };
}

export function worldToScreen(camera: Camera, x: number, y: number) {
  'worklet';
  return { x: x * camera.k + camera.tx, y: y * camera.k + camera.ty };
}
export function screenToWorld(camera: Camera, sx: number, sy: number) {
  'worklet';
  return { x: (sx - camera.tx) / camera.k, y: (sy - camera.ty) / camera.k };
}

/** Scale by `factor` keeping the screen point (fx, fy) over the same world point. */
export function zoomAbout(
  camera: Camera,
  factor: number,
  fx: number,
  fy: number,
  kMin: number,
  kMax: number,
): Camera {
  'worklet';
  const k = Math.min(kMax, Math.max(kMin, camera.k * factor));
  const ratio = k / camera.k;
  return {
    k,
    tx: fx - (fx - camera.tx) * ratio,
    ty: fy - (fy - camera.ty) * ratio,
  };
}

/**
 * The translation range that keeps the world box in view: its centre may
 * reach the viewport's inset edges but no further, so a flick can never
 * strand the reader on blank paper.
 */
export function translationRange(
  k: number,
  bounds: Bounds,
  viewport: Viewport,
): { x: [number, number]; y: [number, number] } {
  'worklet';
  const { width, height, insets } = viewport;
  const cx = ((bounds.minX + bounds.maxX) / 2) * k;
  const cy = ((bounds.minY + bounds.maxY) / 2) * k;
  const halfW = ((bounds.maxX - bounds.minX) / 2) * k;
  const halfH = ((bounds.maxY - bounds.minY) / 2) * k;
  const left = insets.left,
    right = width - insets.right,
    top = insets.top,
    bottom = height - insets.bottom;
  // tx places the world centre at tx + cx: keep that between the edges,
  // less the half-extent so the box's own edge can reach the viewport edge.
  const minX = Math.min(left - cx, right - cx - halfW);
  const maxX = Math.max(right - cx, left - cx + halfW);
  const minY = Math.min(top - cy, bottom - cy - halfH);
  const maxY = Math.max(bottom - cy, top - cy + halfH);
  return { x: [minX, maxX], y: [minY, maxY] };
}

export function clampCamera(
  camera: Camera,
  bounds: Bounds,
  viewport: Viewport,
  kMin: number,
  kMax: number,
): Camera {
  'worklet';
  const k = Math.min(kMax, Math.max(kMin, camera.k));
  const range = translationRange(k, bounds, viewport);
  return {
    k,
    tx: Math.min(range.x[1], Math.max(range.x[0], camera.tx)),
    ty: Math.min(range.y[1], Math.max(range.y[0], camera.ty)),
  };
}

/**
 * Where the stage puts the camera when the box, the viewport or the layout
 * changes. Before the first placement the view follows the fit while the
 * layout settles (its box grows as it does); once settled, the kept camera
 * (clamped to the settled box) or the fit is placed, once. After that the
 * current view is kept inside the limits.
 */
export function placeCamera(
  state: { placed: boolean; settled: boolean },
  cameras: { kept: Camera | null; current: Camera },
  bounds: Bounds,
  viewport: Viewport,
): { camera: Camera; placed: boolean } {
  const fit = fitCamera(bounds, viewport);
  const kMin = fit.k * ZOOM_OUT,
    kMax = fit.k * ZOOM_IN;
  if (state.placed)
    return {
      camera: clampCamera(cameras.current, bounds, viewport, kMin, kMax),
      placed: true,
    };
  if (!state.settled) return { camera: fit, placed: false };
  return {
    camera: cameras.kept
      ? clampCamera(cameras.kept, bounds, viewport, kMin, kMax)
      : fit,
    placed: true,
  };
}

/** The camera centred on a world point at scale `k` (the current one by default). */
export function cameraAt(
  camera: Camera,
  x: number,
  y: number,
  viewport: Viewport,
  k = camera.k,
): Camera {
  'worklet';
  const centre = viewportCentre(viewport);
  return { k, tx: centre.x - x * k, ty: centre.y - y * k };
}

/**
 * A double tap, told apart on JS: two taps within the window and the slop.
 * (A native tap made to wait for a double tap to fail never fired at all on
 * iOS, so the stage takes single taps and decides itself.)
 */
export interface TapPoint {
  x: number;
  y: number;
  at: number;
}
export const DOUBLE_TAP_MS = 280;
export const DOUBLE_TAP_SLOP = 24;
export function isDoubleTap(
  previous: TapPoint | null,
  next: TapPoint,
  window = DOUBLE_TAP_MS,
  slop = DOUBLE_TAP_SLOP,
) {
  return (
    previous !== null &&
    next.at - previous.at < window &&
    Math.hypot(next.x - previous.x, next.y - previous.y) < slop
  );
}

/** Where a tap-to-focus flies: at least a readable zoom, never further out. */
export function focusScale(current: number, fit: number) {
  'worklet';
  return Math.max(current, fit * 2.6);
}

/**
 * Whether a disc (world centre and radius) lies wholly inside the viewport's
 * insets, with a margin: what "in view" means when the chrome covers the
 * edges of the stage.
 */
export function discInView(
  camera: Camera,
  x: number,
  y: number,
  r: number,
  viewport: Viewport,
  margin = 0,
) {
  'worklet';
  const sx = x * camera.k + camera.tx;
  const sy = y * camera.k + camera.ty;
  const sr = r * camera.k;
  const { width, height, insets } = viewport;
  return (
    sx - sr >= insets.left + margin &&
    sx + sr <= width - insets.right - margin &&
    sy - sr >= insets.top + margin &&
    sy + sr <= height - insets.bottom - margin
  );
}

function smooth(t: number) {
  'worklet';
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
/** 0 at `from`, 1 at `to`, smooth between: a layer fading in with the zoom. */
export function ramp(level: number, from: number, to: number) {
  'worklet';
  return smooth((level - from) / (to - from));
}

/**
 * Level of detail, by zoom level (k relative to the fit). Small discs and
 * thin lines fade in as the reader comes closer; cluster names give way to
 * node names.
 */
export const LOD = {
  smallNodes: [0.7, 2.0] as const,
  thinEdges: [1.2, 2.6] as const,
  publicEdges: [1.0, 2.4] as const,
  clusterLabels: [1.9, 3.0] as const,
  names: [2.1, 3.4] as const,
};
export function smallNodeOpacity(level: number) {
  'worklet';
  return 0.38 + 0.62 * ramp(level, LOD.smallNodes[0], LOD.smallNodes[1]);
}
export function thinEdgeOpacity(level: number) {
  'worklet';
  return 0.25 + 0.75 * ramp(level, LOD.thinEdges[0], LOD.thinEdges[1]);
}
/** Public money lines: a haze at the overview, firm once the reader is closer. */
export function publicEdgeOpacity(level: number) {
  'worklet';
  return 0.3 + 0.7 * ramp(level, LOD.publicEdges[0], LOD.publicEdges[1]);
}
export function clusterLabelOpacity(level: number) {
  'worklet';
  return 1 - ramp(level, LOD.clusterLabels[0], LOD.clusterLabels[1]);
}
export function nameOpacity(level: number) {
  'worklet';
  return ramp(level, LOD.names[0], LOD.names[1]);
}

/** Whether a screen point is inside the viewport (with a margin). */
export function onScreen(
  sx: number,
  sy: number,
  viewport: Viewport,
  margin = 0,
) {
  'worklet';
  return (
    sx >= -margin &&
    sy >= -margin &&
    sx <= viewport.width + margin &&
    sy <= viewport.height + margin
  );
}
