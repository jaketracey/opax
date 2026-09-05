// ---------------------------------------------------------------------------
// The opening reveal - the camera choreography a subject page's map runs once,
// when it opens on a donor, an organisation, a campaigner or a party.
//
// The page is about one entity, so the map opens on that entity rather than on
// the whole scene: close enough to read its name, held for a beat, then eased
// out and around until it shares the frame with the parties it gave the most
// to (or, for a party, the donors it took the most from), those flows lit and
// the rest of the map quiet. Three seconds, then the map is the map: the card,
// the scrub and every gesture behave exactly as they do without it.
//
// Three rules the choreography answers to:
//
//   the reader wins   the first press, drag, wheel notch or arrow key ends it
//                     where it stands - no snap back, no queued second leg
//   no motion means   under prefers-reduced-motion the map opens ON the final
//   no motion         framing: the same composition, arrived at with no move
//   it is a camera    the scene is untouched but for the emphasis, which is
//                     the engine's own selection dimming, released before the
//                     camera stops so the reader never sees a static flicker
//
// The camera primitives live in the engine (frameOn, swingTheta); this module
// is only the score.
// ---------------------------------------------------------------------------

import { easeInOut, type KnowledgeMapEngine } from './map3d-engine.ts'
import type { MapEdge } from './map-types.ts'

/** The close-up holds here before the camera moves. */
const HOLD_MS = 900
/** The pull-out. HOLD + OUT is the whole choreography: 2.6s. */
const OUT_MS = 1700
/**
 * The spotlight is handed back this long before the camera stops, so the rest
 * of the map comes up while the view is still easing rather than blinking on
 * under a still frame.
 */
const RELEASE_LEAD_MS = 450

/** The close-up: the subject fills this much of the free box, plus label room. */
const CLOSE_FILL = 0.3
const CLOSE_PAD_PX = 30
/** The landing: the subject and its strongest counterparties, with room to breathe. */
const OUT_FILL = 0.88
const OUT_PAD_PX = 38

/**
 * How far the camera comes around. Enough that the move is felt even when the
 * flows already lie across the screen, never so far that the map spins.
 */
const SWING_MIN = 0.3
const SWING_MAX = 1.05
/** A touch more elevation on the way out, so the ring reads as a ring. */
const LIFT = 0.1

export type RevealSpec = {
  /** The entity the page is about. */
  focusId: string
  /** Its strongest counterparties in the current year window, largest first. */
  withIds: string[]
  /** The flows between them - lit while the camera pulls out. */
  edges: MapEdge[]
}

export type RevealHooks = {
  /**
   * Light the focus and its strongest flows alone (`true`), or hand emphasis
   * back to the plain selection the map would have shown anyway (`false`).
   */
  spotlight: (on: boolean) => void
}

export type Reveal = {
  /** Stop where the camera stands and give the map back. Idempotent. */
  cancel: () => void
  /** The panels finished measuring: re-solve the leg still being held. */
  remeasure: () => void
  readonly running: boolean
}

const NOOP_REVEAL: Reveal = { cancel: () => {}, remeasure: () => {}, running: false }

/**
 * Run the reveal. Returns a handle even when there is nothing to reveal (a
 * subject with no flows in the window), so the caller never branches on null.
 */
export function runReveal(
  engine: KnowledgeMapEngine,
  spec: RevealSpec,
  hooks: RevealHooks,
): Reveal {
  const cast = [spec.focusId, ...spec.withIds]
  // Nothing to pull out to: one node alone is a zoom, not a reveal. The
  // caller's ordinary focus move is the better behaviour.
  if (spec.withIds.length === 0) return NOOP_REVEAL

  // A subject sitting on top of its own counterparties (a party at the centre
  // of the donors that fund it) gives no direction to lay across the screen;
  // the smallest swing still carries the sense of coming around.
  const swing = () =>
    engine.swingTheta(spec.focusId, spec.withIds, { min: SWING_MIN, max: SWING_MAX }) ??
      engine.viewAngles.theta + SWING_MIN

  const landing = (duration: number) => {
    const { phi } = engine.viewAngles
    return engine.frameOn(cast, {
      fill: OUT_FILL,
      padPx: OUT_PAD_PX,
      duration,
      ease: easeInOut,
      theta: swing(),
      phi: phi - LIFT,
    })
  }

  // Reduced motion: the composition without the move. No spotlight either -
  // it would only be a flicker with no camera behind it.
  if (engine.reducedMotion) {
    landing(0)
    return NOOP_REVEAL
  }

  let phase: 'close' | 'out' | 'done' = 'close'
  const timers: ReturnType<typeof setTimeout>[] = []
  const at = (ms: number, run: () => void) => {
    timers.push(setTimeout(run, ms))
  }

  const closeUp = (duration: number) =>
    engine.frameOn([spec.focusId], {
      fill: CLOSE_FILL,
      padPx: CLOSE_PAD_PX,
      duration,
    })

  const stop = () => {
    for (const timer of timers) clearTimeout(timer)
    timers.length = 0
  }

  const reveal: Reveal = {
    get running() {
      return phase !== 'done'
    },
    cancel: () => {
      if (phase === 'done') return
      // Mid-flight: the camera keeps the frame it has reached rather than
      // finishing a move the reader has already overruled.
      if (phase === 'out') engine.stopViewMove()
      phase = 'done'
      stop()
      hooks.spotlight(false)
    },
    remeasure: () => {
      // Only the held close-up: re-solving a leg in flight would jerk it, and
      // the panels have always settled by then.
      if (phase === 'close') closeUp(0)
    },
  }

  // The map opens ON the close-up - it is where the first frame is painted,
  // not somewhere the camera travels to from a fit the reader never saw.
  closeUp(0)
  hooks.spotlight(true)
  at(HOLD_MS, () => {
    if (phase !== 'close') return
    phase = 'out'
    landing(OUT_MS)
  })
  at(HOLD_MS + OUT_MS - RELEASE_LEAD_MS, () => {
    if (phase !== 'out') return
    hooks.spotlight(false)
  })
  at(HOLD_MS + OUT_MS, () => {
    if (phase === 'done') return
    phase = 'done'
    hooks.spotlight(false)
  })
  return reveal
}
