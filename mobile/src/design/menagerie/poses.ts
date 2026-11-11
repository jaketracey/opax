// The web menagerie uses these same percentages of its 16 second cycle.
export type Frame = readonly [at: number, angle: number, lift: number];
export type AnimalName = 'wombat' | 'echidna' | 'platypus' | 'emu';
export type PartKind = 'beat' | 'rock' | 'legA' | 'legB' | 'tail' | 'eye';
const poses = {
  wombat: {
    stride: 2,
    tilt: 1.6,
    lift: 0.8,
    legs: 9,
    beat: [
      [0, 0, 0],
      [45, 0, 0],
      [48, 7, 0],
      [50.5, 6.6, 0],
      [53.5, -0.8, 0],
      [55.5, 0, 0],
      [100, 0, 0],
    ],
  },
  echidna: {
    stride: 2,
    tilt: 2.3,
    lift: 0.5,
    legs: 7,
    beat: [
      [0, 0, 0],
      [45, 0, 0],
      [47.5, 9, 0],
      [49.5, 7.4, 0],
      [51, 9.4, 0],
      [53.5, -1, 0],
      [55.5, 0, 0],
      [100, 0, 0],
    ],
  },
  platypus: {
    stride: 2,
    tilt: 0.9,
    lift: 0.5,
    legs: 8,
    beat: [
      [0, 0, 0],
      [45, 0, 0],
      [48, 5.6, 0],
      [50, 4.5, 0],
      [51.5, 5.9, 0],
      [54, -0.7, 0],
      [56, 0, 0],
      [100, 0, 0],
    ],
  },
  emu: {
    stride: 2.75,
    tilt: 0.8,
    lift: 1.3,
    legs: 12,
    beat: [
      [0, 0, 0],
      [45.5, 0, 0],
      [48, -8, 0],
      [51, -6.8, 0],
      [53.5, 3, 0],
      [56, 0, 0],
      [100, 0, 0],
    ],
  },
} as const;

function gait(stride: number, angle: number, lift = 0): Frame[] {
  const frames: Frame[] = [];
  for (const [start, end] of [
    [0, 44],
    [56, 100],
  ] as const) {
    const n = Math.round((end - start) / stride);
    for (let i = 0; i <= n; i++) {
      frames.push([start + i * stride, i % 2 ? angle : -angle, 0]);
      if (lift && i < n) frames.push([start + (i + 0.5) * stride, 0, -lift]);
    }
  }
  frames.push([45.5, 0, 0], [54.5, 0, 0]);
  return frames.sort((a, b) => a[0] - b[0]);
}

export const animals = Object.keys(poses) as AnimalName[];
function framesFor(name: AnimalName): Record<PartKind, readonly Frame[]> {
  const pose = poses[name];
  return {
    beat: pose.beat,
    rock: gait(pose.stride, pose.tilt, pose.lift),
    legA: gait(pose.stride, pose.legs),
    legB: gait(pose.stride, -pose.legs),
    tail: gait(11, 2.5),
    eye: [],
  };
}
export const frames = {
  wombat: framesFor('wombat'),
  echidna: framesFor('echidna'),
  platypus: framesFor('platypus'),
  emu: framesFor('emu'),
};
