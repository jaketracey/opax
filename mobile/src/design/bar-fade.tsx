import { GroundFade, type GroundFadeGround } from './ground-fade';

/** How far below the bar's foot the fade runs out (pt). */
export const BAR_FADE_TAIL = 16;
/** The fade starts this far above the bar's foot (pt): the title sits above. */
const BAR_FADE_LEAD = 12;

/**
 * A page under a clear bar fades into its own ground behind the bar: opaque
 * behind the status strip and the title, clear just below the bar's foot.
 * No edge and no hairline, and at rest nothing shows, since it is the ground
 * over the ground. UIKit's soft scroll edge alone left the inline title
 * printed over barely softened text (Bills, iOS 27), and at accessibility
 * sizes over large blurred words (iOS 26.3). The owner mounts it only while
 * content is under the bar, over the top of the scrolling view. `bottom` is
 * the bar's foot in the owner's coordinates.
 */
export function BarFade({
  bottom,
  ground = 'paper',
}: {
  bottom: number;
  ground?: GroundFadeGround;
}) {
  if (bottom <= 0) return null;
  const height = bottom + BAR_FADE_TAIL;
  return (
    <GroundFade
      side="top"
      ground={ground}
      hold={Math.max(0, bottom - BAR_FADE_LEAD) / height}
      testID="bar-fade"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}
    />
  );
}
