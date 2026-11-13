import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measures, quantiles, report } from '../scripts/perf-probe';

const MB = 1024 * 1024;
const launch = {
  bundle: 100,
  marks: [
    ['today-bill-0', 780],
    ['preload-start', 2500],
    ['preload-heap-start', 2500, [40 * MB, 64 * MB, 3]],
    ['preload-read', 2540, '/votes.json'],
    ['preload-heap-end', 2700, [52 * MB, 72 * MB, 4]],
    ['preload-done', 2700],
    ['intent', 9000, '/person/anthony-albanese'],
    ['intent-heap', 9000, [50 * MB, 72 * MB, 5]],
    ['profile-render', 9040, 'loading'],
    ['profile-drawn-layout', 9180],
    ['profile-drawn', 9210],
    ['intent', 12000, '/'],
    ['intent', 15000, '/person/anthony-albanese'],
    ['intent-heap', 15000, [51 * MB, 72 * MB, 6]],
    ['profile-render', 15030, 'memo'],
    ['profile-drawn', 15120],
  ],
} as never;

test('one launch: Today, each profile open in order, the preload and the heap', () => {
  expect(measures(launch)).toEqual({
    'today-bill-0 render': 680,
    'open 1 render': 40,
    'open 1 from memory': 0,
    'open 1 drawn': 210,
    'heap at first link MB': 50,
    'open 2 render': 30,
    'open 2 from memory': 1,
    'open 2 drawn': 120,
    'preload ms': 200,
    'preload finished': 1,
    'preload reads': 1,
    'preload allocated MB': 12,
    'preload GCs': 1,
  });
});

test('an open that never drew has no drawn time', () => {
  const file = {
    bundle: 0,
    marks: [
      ['intent', 10, '/person/a'],
      ['profile-render', 20, 'loading'],
      ['intent', 30, '/person/b'],
      ['profile-render', 35, 'loading'],
      ['profile-drawn', 90],
    ],
  } as never;
  expect(measures(file)).toMatchObject({
    'open 1 render': 10,
    'open 2 render': 5,
    'open 2 drawn': 60,
  });
  expect(measures(file)).not.toHaveProperty('open 1 drawn');
});

test('median and nearest-rank p90', () => {
  expect(quantiles([5, 1, 3, 2, 4, 6, 7, 8, 9, 10])).toEqual({
    n: 10,
    median: 5.5,
    p90: 9,
    min: 1,
    max: 10,
  });
  expect(quantiles([3])).toMatchObject({ median: 3, p90: 3 });
});

test('report groups launches by directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'perf-probe-'));
  try {
    mkdirSync(join(root, 'after'));
    writeFileSync(join(root, 'after', 'run-01.json'), JSON.stringify(launch));
    writeFileSync(join(root, 'after', 'run-02.json'), JSON.stringify(launch));
    writeFileSync(join(root, 'after', 'broken.json'), '{');
    const table = report([join(root, 'after')]);
    expect(table).toContain(
      '| after | open 1 drawn | 2 | 210 | 210 | 210 | 210 |',
    );
    expect(table).toContain('| after | today-bill-0 render | 2 | 680 |');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
