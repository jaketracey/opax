/**
 * The launch cover's beats, in milliseconds (shell.md 3, today.md 2).
 * Content is mounted underneath the whole time; the cover is the native
 * splash's own layers (the star and the "OPAX" wordmark on navy), so hiding
 * the native splash under it shows no seam. It is hidden from VoiceOver.
 *
 * Two sequences:
 *
 * - `short` (later cold launches): the lockup holds until the first screen
 *   has laid out, never longer than `handoff.latestFade`, then one crossfade
 *   of `handoff.fade` (motion.launch). Reduce Motion: a cut, no later than
 *   the fade would have ended (`latestStart`).
 * - `full` (once per device, see played.ts): the four letters of OPAX
 *   unfold into the full name, hold while it is read, then the field fades
 *   to the app. Never longer than `splash.full` adds up to, plus any wait for
 *   the first screen; a tap skips to the exit as soon as the app is ready.
 *   Reduce Motion: the name crossfades in place of the unfold.
 *
 * On a first launch the cover waits for the welcome's first layout, with
 * `handoff.splashFailsafe` as the ceiling. Warm launches (the app returning
 * from the background) never mount a cover at all.
 */
export const handoff = {
  fade: 240,
  latestFade: 400,
  reducedFade: 0,
  /** Hide the splash regardless after this long (never trap anyone). */
  splashFailsafe: 4000,
} as const;

export const splash = {
  /** The name unfolds: settle, unfold, hold, exit. 1.9 s. */
  full: { settle: 100, unfold: 900, hold: 550, exit: 350 },
  /** Reduce Motion: a crossfade in place of the unfold. 1.35 s. */
  reduced: { settle: 100, crossfade: 300, hold: 650, exit: 300 },
  /** The exit after a tap. */
  skipExit: 250,
  /** How far the lockup recedes as the field fades (scale). */
  exitScale: 0.96,
  /**
   * Choreography windows, as fractions of `full.unfold`. A line's window
   * starts `stagger` later than the line above it.
   */
  stagger: 0.08,
  windows: {
    /** The wordmark image dissolves into the live letters it matches. */
    swap: [0, 0.1],
    /** The star rises and settles above the name. */
    star: [0, 0.8],
    /** A letter travels from the wordmark to its line. */
    letter: [0, 0.62],
    /** The rest of a word fades in beside its letter. */
    rest: [0.42, 0.78],
  },
} as const;

export type SplashSequence = 'full' | 'short';

/** The full sequence's length when nothing waits on the app, in ms. */
export function fullSequenceLength(reduced: boolean): number {
  if (reduced) {
    const r = splash.reduced;
    return r.settle + r.crossfade + r.hold + r.exit;
  }
  const f = splash.full;
  return f.settle + f.unfold + f.hold + f.exit;
}

/** When the short fade starts, in ms after the cover is drawn, given readiness. */
export function fadeStart(readyAt: number, reduced: boolean): number {
  return Math.max(0, reduced ? readyAt : Math.min(handoff.latestFade, readyAt));
}

/**
 * When a short handoff stops waiting for the first screen and goes anyway,
 * in ms after the cover is drawn. A fade starts at `latestFade` and covers
 * whatever the screen still settles for its 240 ms. A Reduce Motion cut has
 * no fade to cover it, so it waits that long too: cutting at `latestFade`
 * showed Today's date 68 pt low for a few frames before the large title's
 * height arrived (sweep 3 recapture, first install under Reduce Motion).
 */
export function latestStart(reduced: boolean): number {
  return handoff.latestFade + (reduced ? handoff.fade : 0);
}

/** The longest a returning launch's short handoff can last. */
export function longestHandoff(reduced: boolean): number {
  return latestStart(reduced) + (reduced ? handoff.reducedFade : handoff.fade);
}

/**
 * The splash image, in points (scripts/render-splash.swift): a 200 x 120
 * image centred on the screen, as the native splash draws it.
 */
export const lockup = { width: 200, height: 120 } as const;
