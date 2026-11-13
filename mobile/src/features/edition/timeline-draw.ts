import { isE2E } from '../../design/environment';
import { todayFixture } from '../today/launch-fixture';

/**
 * The bill plate's timeline draws once per edition per launch (sweep 3,
 * item 8): its first appearance, on Today or the story, whichever comes
 * first. A plate the reader saw finished (Reduce Motion) has used its turn
 * too, so nothing draws on scroll back, on a return to Today or on the story
 * after the card. A still plate (an image of it, Today's late slot or the
 * card at accessibility sizes, all where the draw would not be seen)
 * leaves the turn alone. Only Today's top slot and the story page draw.
 */
const seen = new Set<string>();

/** The edition a timeline belongs to: its date and record. */
export const timelineKey = (edition: { date: string; path: string }) =>
  `${edition.date}|${edition.path}`;

/**
 * Whether this edition's timeline may still draw this launch. E2E builds
 * draw only with the `OPAXPlateDraw` launch argument, so screenshots never
 * catch a half-drawn line.
 */
export function timelineMayDraw(key: string): boolean {
  if (seen.has(key)) return false;
  return !isE2E || todayFixture().plateDraw === 'on';
}

/** Its turn is used, drawn or shown finished. */
export function timelineShown(key: string) {
  seen.add(key);
}

/** Tests only: a fresh launch. */
export function resetTimelineDrawForTests() {
  seen.clear();
}
