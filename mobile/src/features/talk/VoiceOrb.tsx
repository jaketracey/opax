import { useEffect, useMemo } from 'react';
import {
  Canvas,
  Circle,
  Group,
  Path,
  RadialGradient,
  usePathValue,
  vec,
} from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useIncreaseContrast } from '../../design/accessibility';
import { light, lightHighContrast, type Role } from '../../design/palette';

/** What the call is doing, as the orb draws it. */
export type OrbPhase =
  | 'rest'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'muted';
const phaseCode: Record<OrbPhase, number> = {
  rest: 0,
  connecting: 1,
  listening: 2,
  thinking: 3,
  speaking: 4,
  muted: 5,
};

/** Raw native loudness (0 to 1, from dBFS) written by useVoiceLevels. */
export interface OrbLevels {
  input: SharedValue<number>;
  output: SharedValue<number>;
  /** Seconds of trust left in real output levels; the orb counts it down. */
  outputFresh: SharedValue<number>;
}

const RINGS = 8;
// A watch-dial rosette engraved in the core: interlaced 12-petal rings.
const ROSETTE = 7;
const PETALS = 12;
const SEGMENTS = 144;
// Ring radii are multiples of the core radius R. The canvas is 4.7R across.
const EXTENT = 2.35;
/**
 * A palette role as Skia's colour ([r, g, b, a], 0 to 1). Skia draws plain
 * colours, so Increase Contrast is resolved here (`strong`), as the role
 * colours resolve it natively elsewhere. `shade` scales the channels: the
 * core's lit and shadowed navy.
 */
function paint(role: Role, alpha = 1, strong = false, shade = 1): number[] {
  const hex = (strong ? lightHighContrast[role] : undefined) ?? light[role];
  const channel = (at: number) =>
    Math.min(1, (parseInt(hex.slice(at, at + 2), 16) / 255) * shade);
  return [channel(1), channel(3), channel(5), alpha];
}

/**
 * The orb's colours, all from the palette: hairline bronze rings (the OPAX
 * engraving register) on a navy core with a bronze-bright glow. Under
 * Increase Contrast the rings, the sweep and the core's edge take the
 * stronger bronze ink at full strength.
 */
function orbColours(strong: boolean) {
  const ring = strong ? 'bronzeInk' : 'bronze';
  return {
    rings: [
      paint(ring, strong ? 1 : 0.95, strong),
      paint(ring, strong ? 0.8 : 0.6, strong),
      paint(ring, 0, strong),
    ],
    rosette: paint('onNavySoft', strong ? 0.35 : 0.2, strong),
    core: [
      paint('navyRaised', 1, false, 1.45),
      paint('navyRaised'),
      paint('navy'),
      paint('navy', 1, false, 0.6),
    ],
    glow: [paint('bronzeBright', 0.75), paint('bronzeBright', 0)],
    halo: [paint('bronzeWash', 0.95), paint('bronzeWash', 0)],
    sweep: paint(ring, 1, strong),
    edge: paint('bronzeBright', strong ? 1 : 0.6),
  };
}

/**
 * Speech-shaped loudness, in [0, 1]: worklet only.
 * Real meter levels are about -60 dBFS (0) to 0 dBFS (1); voices sit near
 * 0.5 to 0.85, so the useful band is stretched across the whole range.
 */
function energyOf(raw: number) {
  'worklet';
  return Math.min(1, Math.max(0, (raw - 0.3) / 0.45));
}

/**
 * The call's living mark. A navy core with bronze contour rings:
 * listening draws the rings in when you speak, OPAX's voice sends them out
 * as ripples, connecting and thinking turn a bronze arc like a watch hand,
 * muted dims and stills. Reduce Motion keeps only a slow fade pulse.
 * Decorative: the caller's status element carries the accessible name.
 */
export function VoiceOrb({
  phase,
  levels,
  size,
  reduceMotion,
}: {
  phase: OrbPhase;
  levels: OrbLevels;
  size: number;
  reduceMotion: boolean;
}) {
  const R = size / (2 * EXTENT);
  const c = size / 2;
  const strong = useIncreaseContrast();
  const colours = useMemo(() => orbColours(strong), [strong]);
  const t = useSharedValue(0);
  const code = useSharedValue(phaseCode[phase]);
  const calm = useSharedValue(reduceMotion ? 1 : 0);
  const energy = useSharedValue(0);
  const heard = useSharedValue(0);
  // Eased layout mixes, so no state change ever jumps.
  const ripple = useSharedValue(0);
  const arc = useSharedValue(0);
  const ringAlpha = useSharedValue(0.55);
  const coreAlpha = useSharedValue(1);
  const pulse = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = Math.min(0.05, (info.timeSincePreviousFrame ?? 16) / 1000);
    const time = t.get() + dt;
    t.set(time);
    const p = code.get();
    const still = calm.get() > 0.5;
    const ease = (tau: number) => 1 - Math.exp(-dt / tau);
    const toward = (value: SharedValue<number>, goal: number, tau: number) =>
      value.set(value.get() + (goal - value.get()) * ease(tau));
    // OPAX's voice: real output levels while they are fresh, otherwise a
    // speech-shaped envelope, so the orb never freezes mid-answer.
    const fresh = Math.max(0, levels.outputFresh.get() - dt);
    levels.outputFresh.set(fresh);
    let target = 0;
    if (p === 4) {
      if (fresh > 0) target = energyOf(levels.output.get());
      else {
        const syllable = 0.5 + 0.5 * Math.sin(time * 2 * Math.PI * 4.3);
        const phrase = 0.6 + 0.4 * Math.sin(time * 2 * Math.PI * 0.37);
        target = 0.25 + 0.55 * syllable * syllable * phrase;
      }
    }
    const voice = p === 2 || p === 3 ? energyOf(levels.input.get()) : 0;
    toward(energy, target, target > energy.get() ? 0.06 : 0.22);
    toward(heard, voice, voice > heard.get() ? 0.08 : 0.3);
    toward(ripple, p === 4 ? 1 : 0, 0.35);
    toward(arc, p === 1 || p === 3 ? 1 : 0, 0.3);
    toward(
      ringAlpha,
      p === 0 ? 0.55 : p === 5 ? 0.3 : p === 1 ? 0.6 : p === 3 ? 0.75 : 1,
      0.3,
    );
    toward(coreAlpha, p === 5 ? 0.5 : 1, 0.3);
    // Reduce Motion: one slow breath of light while OPAX speaks or connects.
    const breathing = p === 4 || p === 1 || p === 3;
    const slow = 0.5 + 0.5 * Math.sin((time * 2 * Math.PI) / 2.4);
    toward(pulse, still ? (breathing ? slow : 0) : energy.get(), 0.12);
  }, false);

  const animated = phase !== 'rest' && !(reduceMotion && phase === 'listening');
  useEffect(() => {
    code.set(phaseCode[phase]);
    calm.set(reduceMotion ? 1 : 0);
    if (animated) {
      frame.setActive(true);
      return;
    }
    // Let the last ripple settle before the frame loop stops.
    const settle = setTimeout(() => frame.setActive(false), 1200);
    return () => clearTimeout(settle);
  }, [phase, reduceMotion, animated, code, calm, frame]);

  // The core swells a little with either voice; the rosette swells with it.
  const swell = useDerivedValue(() =>
    calm.get() > 0.5
      ? 1
      : 1 +
        0.012 * Math.sin(t.get() * 1.5) +
        0.06 * energy.get() * ripple.get() +
        0.035 * heard.get(),
  );
  const rings = usePathValue((path) => {
    'worklet';
    const still = calm.get() > 0.5;
    const time = still ? 0 : t.get();
    const out = still ? 0 : ripple.get();
    const inward = still ? 0 : heard.get();
    const loud = still ? 0 : energy.get();
    for (let i = 0; i < RINGS; i++) {
      const k = i / RINGS;
      // Resting contour: evenly spaced, drawn in a little by your voice.
      const breath = 0.01 * Math.sin(time * 1.5 - i * 0.6);
      const rest =
        R * (1.2 + 0.14 * i) * (1 + breath - 0.06 * inward * (1 - k));
      // Speaking: rings rise from behind the core and travel outward.
      const age = (time * 0.45 + k) % 1;
      const wave = R * (0.96 + 1.3 * age);
      const r = rest + (wave - rest) * out;
      const a =
        R * (0.004 + 0.03 * inward + 0.055 * loud * (1 - 0.5 * age * out));
      for (let s = 0; s <= SEGMENTS; s++) {
        const th = (s / SEGMENTS) * 2 * Math.PI;
        const d =
          0.5 * Math.sin(3 * th + 1.3 * time + i) +
          0.3 * Math.sin(5 * th - 0.9 * time + 2 * i) +
          0.2 * Math.sin(2 * th + 0.6 * time + 0.5 * i);
        const x = c + (r + a * d) * Math.cos(th);
        const y = c + (r + a * d) * Math.sin(th);
        if (s === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.close();
    }
  });
  const rosette = usePathValue((path) => {
    'worklet';
    const still = calm.get() > 0.5;
    const time = still ? 0 : t.get();
    const loud = still ? 0 : energy.get();
    const scale = R * swell.get();
    for (let j = 0; j < ROSETTE; j++) {
      const r = scale * (0.2 + 0.105 * j);
      const a = 0.05 + 0.06 * loud;
      // Each ring's petals turn a little further: the interlaced dial.
      const turn = j * 0.42 + time * (j % 2 === 0 ? 0.18 : -0.18);
      for (let s = 0; s <= SEGMENTS; s++) {
        const th = (s / SEGMENTS) * 2 * Math.PI;
        const rr = r * (1 + a * Math.sin(PETALS * th + turn));
        const x = c + rr * Math.cos(th);
        const y = c + rr * Math.sin(th);
        if (s === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      }
      path.close();
    }
  });
  const sweep = usePathValue((path) => {
    'worklet';
    const turn = (t.get() / 1.8) * 360;
    const r = R * 1.09;
    path.addArc(
      { x: c - r, y: c - r, width: 2 * r, height: 2 * r },
      turn % 360,
      70,
    );
  });
  const coreR = useDerivedValue(() => R * swell.get());
  const glow = useDerivedValue(() => 0.12 + 0.55 * pulse.get());
  const halo = useDerivedValue(() => 0.35 + 0.65 * pulse.get());
  const sweepAlpha = useDerivedValue(() =>
    calm.get() > 0.5 ? 0 : arc.get() * 0.9,
  );
  const ringsAlpha = useDerivedValue(() =>
    calm.get() > 0.5 && arc.get() > 0.5
      ? ringAlpha.get() * (0.55 + 0.45 * pulse.get())
      : ringAlpha.get(),
  );
  const centre = useMemo(() => vec(c, c), [c]);
  const highlight = useMemo(() => vec(c - 0.32 * R, c - 0.38 * R), [c, R]);
  return (
    <Canvas
      style={{ width: size, height: size }}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={c} cy={c} r={R * EXTENT} opacity={halo}>
        <RadialGradient
          c={centre}
          r={R * EXTENT}
          colors={colours.halo}
          positions={[0.45, 1]}
        />
      </Circle>
      <Group opacity={ringsAlpha}>
        <Path path={rings} style="stroke" strokeWidth={1}>
          <RadialGradient
            c={centre}
            r={R * EXTENT}
            colors={colours.rings}
            positions={[0.48, 0.8, 1]}
          />
        </Path>
      </Group>
      <Path
        path={sweep}
        style="stroke"
        strokeWidth={1.5}
        strokeCap="round"
        color={colours.sweep}
        opacity={sweepAlpha}
      />
      <Group opacity={coreAlpha}>
        <Circle cx={c} cy={c} r={coreR}>
          <RadialGradient
            c={highlight}
            r={R * 1.7}
            colors={colours.core}
            positions={[0, 0.28, 0.68, 1]}
          />
        </Circle>
        <Path
          path={rosette}
          style="stroke"
          strokeWidth={0.75}
          color={colours.rosette}
        />
        <Circle cx={c} cy={c} r={coreR} opacity={glow}>
          <RadialGradient c={centre} r={R} colors={colours.glow} />
        </Circle>
        <Circle
          cx={c}
          cy={c}
          r={coreR}
          style="stroke"
          strokeWidth={1}
          color={colours.edge}
        />
      </Group>
    </Canvas>
  );
}
