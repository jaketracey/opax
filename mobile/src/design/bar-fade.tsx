import { useSolidBar } from './accessibility';
import type { GroundFadeGround } from './ground-fade';

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
  // Loaded on first use, not with every page: the fade module reads an
  // accessibility setting as it loads, and Screen imports this file.
  const { GroundFade } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('./ground-fade') as typeof import('./ground-fade');
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

/**
 * The fade for a bar that is clear unless a legibility setting makes it
 * solid (Reduce Transparency, Increase Contrast): a solid bar covers its own
 * content and the page starts below it. The setting is read here, so only a
 * page with content under its bar subscribes to it.
 */
export function ClearBarFade(props: {
  bottom: number;
  ground?: GroundFadeGround;
}) {
  return useSolidBar() ? null : <BarFade {...props} />;
}
