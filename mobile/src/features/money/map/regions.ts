import {
  activeHorizontalFold,
  activeVerticalFold,
  placeClear,
  sidesOf,
  type Rect,
  type ReservedRegions,
} from '../../../design/fold';
import { minimumTarget, rhythm } from '../../../design/tokens';

const area = (r: Rect) => r.width * r.height;

/** The largest drawable rectangle left by all active camera regions. */
function clearRegion(bounds: Rect, regions: ReservedRegions): Rect {
  let spaces = [bounds];
  for (const camera of regions.occlusions.filter((r) => r.active)) {
    spaces = spaces.flatMap((space) => {
      const left = Math.max(space.x, camera.x);
      const right = Math.min(space.x + space.width, camera.x + camera.width);
      const top = Math.max(space.y, camera.y);
      const bottom = Math.min(space.y + space.height, camera.y + camera.height);
      if (left >= right || top >= bottom) return [space];
      return [
        { ...space, width: left - space.x },
        { ...space, x: right, width: space.x + space.width - right },
        { ...space, height: top - space.y },
        { ...space, y: bottom, height: space.y + space.height - bottom },
      ];
    });
  }
  const clear = spaces.sort((a, b) => area(b) - area(a))[0] ?? bounds;
  return placeClear(clear, regions, bounds);
}

/** Book: view on the larger side, controls opposite. Laptop: view above. */
export function mapRegions(bounds: Rect, regions: ReservedRegions) {
  let scene = bounds;
  let controls = bounds;
  const vertical = activeVerticalFold(regions.divisions);
  const horizontal = activeHorizontalFold(regions.divisions);
  if (vertical) {
    const sides = sidesOf(vertical, bounds);
    if ('leading' in sides) {
      const trailing = area(sides.trailing) >= area(sides.leading);
      scene = trailing ? sides.trailing : sides.leading;
      controls = trailing ? sides.leading : sides.trailing;
    }
  }
  if (horizontal) {
    const viewing = sidesOf(horizontal, scene);
    const interacting = sidesOf(horizontal, controls);
    if ('top' in viewing) scene = viewing.top;
    if ('bottom' in interacting) controls = interacting.bottom;
  }
  return {
    scene: clearRegion(scene, regions),
    controls: clearRegion(controls, regions),
    folded: !!(vertical || horizontal),
    laptop: !!horizontal,
  };
}

/** The gaps above and below the control band, in points. */
const BAND_GAPS = rhythm.block * 2;

/**
 * What the stage's chrome is doing: at rest with the control band shown,
 * with the panel expanded (the band hides), or with the search in the card's
 * place (the band hides).
 */
export type ChromeState = 'map' | 'expanded' | 'search';

/**
 * At accessibility text sizes the card above the map and the panel under it
 * share the height the control band leaves, so the search and zoom buttons
 * between them stay whole on screen at every size. The card takes at most
 * half and scrolls inside it; the panel takes what the card leaves and
 * scrolls too. The card keeps its share while the panel is expanded, so it
 * holds still when the band hides; the search card stands in its place and
 * may use the band's room.
 */
export function largeTextLimits(
  height: number,
  topHeight: number,
  controlHeight: number,
  state: ChromeState,
  /** Height kept for the map itself (a short adaptive window); 0 on a phone. */
  sceneFloor = 0,
) {
  const room = (band: number) =>
    Math.max(0, height - band - BAND_GAPS - sceneFloor);
  const topMaxHeight = Math.max(
    minimumTarget,
    Math.floor(room(state === 'search' ? 0 : controlHeight) / 2),
  );
  return {
    topMaxHeight,
    panelMaxHeight: Math.max(
      minimumTarget,
      room(state === 'map' ? controlHeight : 0) -
        Math.min(topHeight, topMaxHeight),
    ),
  };
}

/** The most of a compact window the map keeps for itself, and its ceiling. */
const SCENE_SHARE = 0.35;
const SCENE_FLOOR_MAX = 200;
/** Widths from here up float a narrow card and panel over the map instead. */
const COMPACT_WIDTH = 600;

/**
 * How much height the map keeps when the card, the band and the panel share
 * one compact column over it (the folded Duo's 466 x 678 outer display, or a
 * camera cut-out on a narrow window). Without it the card and the panel took
 * all but about 110 pt at the default size and all of it at large text
 * (BACKLOG D7). A fold or a hinge gives the map its own side: no floor.
 */
export function sceneFloor(pose: { folded: boolean; controls: Rect }) {
  if (pose.folded || pose.controls.width >= COMPACT_WIDTH) return 0;
  return Math.round(
    Math.min(SCENE_FLOOR_MAX, pose.controls.height * SCENE_SHARE),
  );
}

/** A compact row preserves room for the scene on the short outer display. */
export function mapControlLayout(
  bounds: Rect,
  regions: ReservedRegions,
  topHeight: number,
  controlsHeight: number,
  controlsVisible = true,
) {
  const pose = mapRegions(bounds, regions);
  const horizontal = pose.laptop || pose.controls.height < 650;
  const controlHeight = !controlsVisible
    ? 0
    : horizontal
      ? 48
      : controlsHeight || 190;
  // The card and the panel share what the band and the map's floor leave:
  // the card at most half of it, the panel what the card does not use.
  const floor = sceneFloor(pose);
  const shared = pose.controls.height - controlHeight - 32 - floor;
  const topMaxHeight = Math.max(
    44,
    floor ? Math.floor(shared / 2) : pose.controls.height - controlHeight - 92,
  );
  return {
    ...pose,
    horizontal,
    sceneFloor: floor,
    topMaxHeight,
    panelMaxHeight: Math.max(
      44,
      shared - (floor ? Math.min(topHeight, topMaxHeight) : topHeight),
    ),
  };
}
