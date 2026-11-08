import { WelcomePage } from './Welcome';

/**
 * The short welcome (first-launch 4.5 D2 to D4): the same full-screen page,
 * presented over a page opened from a link on the first launch, so the
 * cultural notice is seen before any portrait on it. Continue records the
 * welcome as seen and closes onto the linked page; there is no seat step,
 * and Today's invitation offers the seat later. A replay from Account gives
 * the full form.
 */
export default function ShortWelcome({ launch = false }: { launch?: boolean }) {
  return <WelcomePage short launch={launch} />;
}
