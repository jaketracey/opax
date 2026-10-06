import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { shape, dict, count, array, text } from '../src/api/validation';
test('all 354 current members retain five block statuses against round 1 and its approved fix', () => {
  const report = shape({
    members: count,
    comparisons: count,
    regressions: count,
    counts: dict(shape({ ready: count, missing: count, error: count })),
    verifiedStatePay: count,
    portraitLicenceRefused: array(text),
  })(
    JSON.parse(
      execFileSync(
        process.execPath,
        ['--import', 'tsx', resolve(__dirname, 'profile-sweep.ts')],
        {
          cwd: resolve(__dirname, '..'),
          timeout: 65000,
          maxBuffer: 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ).toString(),
    ),
  );
  expect(report.members).toBe(354);
  expect(report.comparisons).toBe(354 * 5 * 2);
  expect(report.regressions).toBe(0);
  for (const key of ['portrait', 'votes', 'interests', 'pay', 'expenses']) {
    const statuses = report.counts[key]!;
    expect(statuses.ready + statuses.missing + statuses.error).toBe(354);
    expect(statuses.error).toBe(0);
  }
  expect(report.verifiedStatePay).toBe(2);
  // The only approved portrait change: a GFDL Commons file, left out by licence.
  expect(report.portraitLicenceRefused).toEqual(['Tim Bull']);
}, 70000);
