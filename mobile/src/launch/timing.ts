/**
 * The launch handoff's beats, in milliseconds (shell.md 3, today.md 2).
 * Content is mounted and touchable underneath the whole time; the cover is
 * the splash image on paper, never takes input and is hidden from VoiceOver.
 *
 * - One crossfade of `fade` (motion.launch) from the splash to the first
 *   screen. No rule under the mark and no hold.
 * - On a returning launch the fade starts when Today's cached reads answer
 *   (`releaseSplash('today')`) and never later than `latestFade` after the
 *   root lays out.
 * - On a first launch the splash waits for the welcome's first layout, with
 *   `splashFailsafe` as the ceiling.
 * - Reduce Motion: a cut.
 */
export const handoff = {
  fade: 240,
  latestFade: 400,
  reducedFade: 0,
  /** Hide the splash regardless after this long (never trap anyone). */
  splashFailsafe: 4000,
} as const;

/** When the fade starts, in ms after the cover is drawn, given readiness. */
export function fadeStart(readyAt: number, reduced: boolean): number {
  return Math.max(0, reduced ? readyAt : Math.min(handoff.latestFade, readyAt));
}

/** The longest a returning launch's handoff can last. */
export function longestHandoff(reduced: boolean): number {
  return handoff.latestFade + (reduced ? handoff.reducedFade : handoff.fade);
}

/**
 * The splash image, in points (scripts/render-splash.swift): a 200 x 120
 * image centred on the screen, as the native splash draws it.
 */
export const lockup = { width: 200, height: 120 } as const;
