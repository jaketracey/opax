import { createContext, useContext, type ReactNode } from 'react';
import Animated, {
  useAnimatedProps,
  type SharedValue,
} from 'react-native-reanimated';
import { G } from 'react-native-svg';
import { frames, type AnimalName, type Frame, type PartKind } from './poses';

export const CYCLE_MS = 16000;
export const ON_STAGE_PHASE = -5.5;
export const STAGE_WIDTH = 112;
export const ANIMAL_WIDTH = 65;
const AnimatedGroup = Animated.createAnimatedComponent(G);
// CSS ease-in-out, cubic-bezier(0.42, 0, 0.58, 1), as in wombat.js.
function ease(t: number) {
  'worklet';
  let s = t;
  for (let i = 0; i < 4; i++)
    s -=
      (((0.52 * s - 0.78) * s + 1.26) * s - t) / ((1.56 * s - 1.56) * s + 1.26);
  return (3 - 2 * s) * s * s;
}
export const AnimalMotion = createContext<{
  clock: SharedValue<number>;
  name: AnimalName;
  phase: number;
  still: boolean;
} | null>(null);

export function cyclePercent(clock: number, phase: number) {
  'worklet';
  return ((((clock - phase / 16) % 1) + 1) % 1) * 100;
}

export function walkPosition(percent: number) {
  'worklet';
  const centre = (STAGE_WIDTH - ANIMAL_WIDTH) / 2;
  if (percent < 44) return -80 + ((centre + 80) * percent) / 44;
  if (percent <= 56) return centre;
  return centre + ((STAGE_WIDTH + 20 - centre) * (percent - 56)) / 44;
}

function poseAt(rows: readonly Frame[], at: number): [number, number] {
  'worklet';
  for (let i = 1; i < rows.length; i++) {
    const to = rows[i]!;
    if (at > to[0]) continue;
    const from = rows[i - 1]!;
    const t = ease(Math.max(0, (at - from[0]) / (to[0] - from[0])));
    return [from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
  }
  const last = rows[rows.length - 1];
  return last ? [last[1], last[2]] : [0, 0];
}

/** Every part derives its pose from the same UI thread clock. */
export function AnimalPart({
  kind,
  origin = [0, 0],
  opacity = 1,
  children,
}: {
  kind: PartKind;
  origin?: readonly [number, number];
  opacity?: number;
  children: ReactNode;
}) {
  const motion = useContext(AnimalMotion)!;
  const { clock, name, phase, still } = motion;
  const rows = frames[name][kind];
  const [x, y] = origin;
  const animatedProps = useAnimatedProps(() => {
    const at = cyclePercent(clock.value, phase);
    const [angle, lift] = still ? [0, 0] : poseAt(rows, at);
    const radians = (angle * Math.PI) / 180;
    const cos = Math.cos(radians),
      sin = Math.sin(radians);
    // SVG's six element matrix rotates about the web drawing's fill box origin.
    return {
      matrix: [
        cos,
        sin,
        -sin,
        cos,
        x - cos * x + sin * y,
        y - sin * x - cos * y + lift,
      ],
      opacity:
        opacity *
        (!still && kind === 'eye' && at % 32.5 > 30.55 && at % 32.5 < 31.04
          ? 0
          : 1),
    };
  });
  return (
    <AnimatedGroup animatedProps={animatedProps}>{children}</AnimatedGroup>
  );
}
