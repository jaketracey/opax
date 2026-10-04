import {
  connectionAuditPass,
  SampleGaps,
  SAMPLE_GAP_LIMIT_MS,
} from '../scripts/connection-audit-policy';

const clean = {
  processSamples: 10,
  errors: [],
  productionConnections: 0,
  nonLoopbackConnections: [],
  longestSampleGapMs: 250,
};

test('regular nominal polling passes', () => {
  const gaps = new SampleGaps(0);
  for (const at of [0, 250, 500]) gaps.sampleStarted(at);
  gaps.check(750);
  expect(gaps.longestSampleGapMs).toBe(250);
  expect(
    connectionAuditPass({
      ...clean,
      longestSampleGapMs: gaps.longestSampleGapMs,
    }),
  ).toBe(true);
});

test('a scheduling gap fails even if each sampler command was fast', () => {
  const gaps = new SampleGaps(0);
  gaps.sampleStarted(0);
  gaps.check(20);
  gaps.sampleStarted(250);
  gaps.check(270);
  gaps.sampleStarted(4000);
  expect(gaps.longestSampleGapMs).toBe(3750);
  expect(
    connectionAuditPass({
      ...clean,
      longestSampleGapMs: gaps.longestSampleGapMs,
    }),
  ).toBe(false);
});

test('alternating slow app processes cannot mask a gap with individually bounded polling cycles', () => {
  const gaps = new SampleGaps(0);
  gaps.sampleStarted(0);
  gaps.activeProcesses(['first', 'second']);
  gaps.processSampled('first', 100);
  gaps.processSampled('second', 2800);
  gaps.check(2900);
  gaps.sampleStarted(2900);
  gaps.activeProcesses(['first', 'second']);
  gaps.processSampled('first', 5500);
  expect(gaps.longestSampleGapMs).toBe(5400);
  expect(
    connectionAuditPass({
      ...clean,
      longestSampleGapMs: gaps.longestSampleGapMs,
    }),
  ).toBe(false);
});

test('retired processes do not create a false gap for a later app launch', () => {
  const gaps = new SampleGaps(0);
  gaps.sampleStarted(0);
  gaps.activeProcesses(['old']);
  gaps.processSampled('old', 100);
  for (let at = 250; at <= 3500; at += 250) {
    gaps.sampleStarted(at);
    gaps.activeProcesses([]);
    gaps.check(at + 20);
  }
  gaps.activeProcesses(['new']);
  gaps.processSampled('new', 3760);
  expect(gaps.longestSampleGapMs).toBe(260);
  expect(
    connectionAuditPass({
      ...clean,
      longestSampleGapMs: gaps.longestSampleGapMs,
    }),
  ).toBe(true);
});

test.each([
  ['startup', [], 4000, 4000],
  ['last in-flight sample', [0, 250], 4000, 3750],
  ['shutdown tail', [0, 250, 500], 4500, 4000],
] as const)(
  '%s cannot hide a slow gap without a following poll',
  (_phase, starts, finishedAt, expected) => {
    const gaps = new SampleGaps(0);
    for (const at of starts) {
      gaps.sampleStarted(at);
      gaps.check(at + 20);
    }
    gaps.check(finishedAt);
    expect(gaps.longestSampleGapMs).toBe(expected);
    expect(
      connectionAuditPass({
        ...clean,
        longestSampleGapMs: gaps.longestSampleGapMs,
      }),
    ).toBe(false);
  },
);

test.each([
  [SAMPLE_GAP_LIMIT_MS, true],
  [SAMPLE_GAP_LIMIT_MS + 1, false],
  [Infinity, false],
  [NaN, false],
])('longest sample gap %s yields audit pass=%s', (longestSampleGapMs, pass) => {
  expect(connectionAuditPass({ ...clean, longestSampleGapMs })).toBe(pass);
});

test.each([
  { processSamples: 0 },
  { errors: ['sampler failed'] },
  { productionConnections: 1 },
  { nonLoopbackConnections: ['127.0.0.1->203.0.113.1:443'] },
])(
  'gap enforcement preserves the existing failure predicate: %j',
  (failure) => {
    expect(connectionAuditPass({ ...clean, ...failure })).toBe(false);
  },
);
