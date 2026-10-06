/**
 * The launch handoff's beats, in milliseconds from the moment it replaces the
 * native splash. Content is mounted and touchable underneath the whole time;
 * the handoff is a veil that never takes input or VoiceOver focus.
 *
 * - The masthead rule draws out from the centre under the wordmark while
 *   the veil fades.
 * - The veil fades as soon as the first screen is ready, with no minimum
 *   hold, and never later than `latestFade`.
 * - Reduce Motion: no rule, a short static fade from the moment it is ready.
 */
export const handoff = {
  rule: 520,
  fade: 440,
  latestFade: 760,
  reducedFade: 240,
  /** Hide the native splash regardless after this long (never trap anyone). */
  splashFailsafe: 4000,
} as const;

/** When the fade starts, from when the first screen was ready. */
export function fadeStart(readyAt: number, reduced: boolean): number {
  return Math.max(0, reduced ? readyAt : Math.min(handoff.latestFade, readyAt));
}

/** The longest the handoff can last. */
export function longestHandoff(reduced: boolean): number {
  return reduced
    ? handoff.latestFade + handoff.reducedFade
    : handoff.latestFade + handoff.fade;
}

/**
 * The splash lockup, in points (scripts/render-splash.swift): a 200 x 120
 * image centred on the screen, with the wordmark's ink ending 104.9pt down.
 * The rule sits 8pt under the wordmark.
 */
export const lockup = {
  width: 200,
  height: 120,
  ruleTop: 113,
  ruleWidth: 120,
} as const;
