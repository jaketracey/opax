import { placeClear, type Rect, type ReservedRegions } from '../../design/fold';

/** Reserve space above a camera before laying out the scrolling call stage. */
export function talkDockPlacement(
  body: Rect,
  dock: { width: number; height: number },
  bottom: number,
  margin: number,
  regions: ReservedRegions,
) {
  const bounds = {
    x: body.x + margin,
    y: body.y,
    width: Math.max(0, body.width - margin * 2),
    height: Math.max(0, body.height - bottom),
  };
  const wanted = {
    x: bounds.x + (bounds.width - dock.width) / 2,
    y: bounds.y + bounds.height - dock.height,
    ...dock,
  };
  const clear = placeClear(wanted, regions, bounds);
  return {
    paddingBottom: bottom + Math.max(0, wanted.y - clear.y),
    translateX: clear.x - wanted.x,
  };
}
