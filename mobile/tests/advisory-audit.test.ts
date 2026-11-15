import { checkAdvisoryAudit } from '../scripts/advisory-audit';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const accepted = [
  {
    package: 'decoder',
    advisory: 'GHSA-old',
    exposure: 'runtime',
    reason: 'Reviewed',
  },
];
const inventory = (ids: string[]) =>
  JSON.stringify({
    vulnerabilities: {
      decoder: {
        via: ids.map((id) => ({ url: `https://github.com/advisories/${id}` })),
      },
    },
  });

test('online accepted advisories pass, but a new advisory in that package fails', () => {
  expect(
    checkAdvisoryAudit(
      { stdout: inventory(['GHSA-old']), stderr: '' },
      accepted,
    ),
  ).toMatch(/^PASS/);
  expect(() =>
    checkAdvisoryAudit(
      { stdout: inventory(['GHSA-old', 'GHSA-new']), stderr: '' },
      accepted,
    ),
  ).toThrow(/New\/unaccepted advisory/);
});
test.each(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'E503'])(
  'registry unavailable (%s) skips with a loud warning',
  (code) => {
    for (const stdout of [
      JSON.stringify({ error: { code } }),
      JSON.stringify({
        message: `request failed, reason: ${code}`,
        error: { summary: '', detail: '' },
      }),
      '',
    ]) {
      expect(
        checkAdvisoryAudit(
          { stdout, stderr: `npm error code ${code}` },
          accepted,
        ),
      ).toMatch(/^WARNING: ADVISORY AUDIT SKIPPED.*NOT checked/);
    }
  },
);
test('a new online advisory fails even with a network warning on stderr', () => {
  expect(() =>
    checkAdvisoryAudit(
      { stdout: inventory(['GHSA-new']), stderr: 'npm warn ECONNRESET' },
      accepted,
    ),
  ).toThrow(/New\/unaccepted advisory/);
});
test('a timed-out audit skips loudly, but a completed inventory still takes priority', () => {
  const error = Object.assign(new Error('spawnSync npm ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });
  expect(
    checkAdvisoryAudit({ stdout: '', stderr: '', error }, accepted),
  ).toMatch(
    /^WARNING: ADVISORY AUDIT SKIPPED.*did not respond within 8s.*NOT checked/,
  );
  expect(() =>
    checkAdvisoryAudit(
      { stdout: inventory(['GHSA-new']), stderr: '', error },
      accepted,
    ),
  ).toThrow(/New\/unaccepted advisory/);
  expect(
    checkAdvisoryAudit(
      { stdout: inventory(['GHSA-old']), stderr: '', error },
      accepted,
    ),
  ).toMatch(/^PASS/);
});
test('a timeout does not hide a completed local audit error', () => {
  const error = Object.assign(new Error('spawnSync npm ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  });
  for (const code of ['ENOLOCK', 'E401'])
    expect(() =>
      checkAdvisoryAudit(
        { stdout: JSON.stringify({ error: { code } }), stderr: '', error },
        accepted,
      ),
    ).toThrow(/Audit unavailable/);
});
/**
 * A registry that accepts every request and never answers. It is listening
 * before any step starts, and `asked` settles on its first request, so no
 * assertion reads a counter at a moment of its own choosing.
 */
async function silentRegistry() {
  let requests = 0;
  let heard!: () => void;
  const asked = new Promise<void>((resolve) => {
    heard = resolve;
  });
  const server = createServer(() => {
    requests++;
    heard();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: (server.address() as AddressInfo).port,
    requests: () => requests,
    /** True once a request has arrived; waits `ms` for one already sent. */
    async wasAsked(ms: number) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waited = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      });
      await Promise.race([asked, waited]);
      clearTimeout(timer);
      return requests > 0;
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
/** One run of the real step against `port`. The outer limit only stops a hang. */
function advisoryStep(port: number, env: Record<string, string> = {}) {
  const started = Date.now();
  return new Promise<{
    error: Error | null;
    stderr: string;
    elapsed: number;
  }>((resolve) => {
    execFile(
      process.execPath,
      [require.resolve('tsx/cli'), 'scripts/qa-advisories.ts'],
      {
        env: {
          ...process.env,
          ...env,
          npm_config_registry: `http://127.0.0.1:${port}`,
          npm_config_proxy: '',
          npm_config_https_proxy: '',
        },
        timeout: stepLimit,
        killSignal: 'SIGKILL',
      },
      (error, _stdout, stderr) =>
        resolve({ error, stderr, elapsed: Date.now() - started }),
    );
  });
}
// The step's own bound is 8 s from the moment it starts npm. This outer
// limit is only there so a step that never returns fails the test; it leaves
// room for tsx and npm to start on a busy machine.
const stepLimit = 30000;
const bounded =
  /^WARNING: ADVISORY AUDIT SKIPPED.*did not respond within 8s.*NOT checked/m;
/**
 * Runs the step until the registry has actually been asked. The step's 8 s
 * covers npm's own start-up, so on a saturated machine npm can be stopped
 * before it sends anything: that run was bounded, but it never met the
 * silent registry, and counting its requests proved nothing (requests=0 on a
 * loaded gate). Every run must end by itself with the warning; a further run
 * happens only when the registry heard nothing.
 */
async function boundedAgainstSilentRegistry(
  registry: Awaited<ReturnType<typeof silentRegistry>>,
  attempts: number,
  env: Record<string, string> = {},
) {
  const runs: { asked: boolean; elapsed: number }[] = [];
  while (runs.length < attempts) {
    const result = await advisoryStep(registry.port, env);
    // Ended by itself (not by the outer limit), with the loud skip.
    expect(result.error).toBeNull();
    expect(result.stderr).toMatch(bounded);
    expect(result.elapsed).toBeLessThan(stepLimit);
    // A request npm sent just before it was stopped may still be in flight.
    const asked = await registry.wasAsked(runs.length ? 2000 : 500);
    runs.push({ asked, elapsed: result.elapsed });
    if (asked) break;
  }
  return runs;
}
test(
  'the real advisory step bounds a registry that accepts requests but never responds',
  async () => {
    const registry = await silentRegistry();
    try {
      const runs = await boundedAgainstSilentRegistry(registry, 4);
      // The run that counts met the silent registry and still came back.
      expect(runs.at(-1)!.asked).toBe(true);
      expect(registry.requests()).toBeGreaterThan(0);
    } finally {
      await registry.close();
    }
  },
  4 * stepLimit + 10000,
);
test(
  'a step stopped before npm asks the registry is run again, not counted (the loaded-gate case)',
  async () => {
    // The slow start, made certain: the first `npm` on the step's PATH only
    // sleeps, as npm does while a saturated machine is still loading it; the
    // next one is the real npm.
    const dir = mkdtempSync(join(tmpdir(), 'opax-advisory-'));
    const shim = join(dir, 'npm');
    writeFileSync(
      shim,
      [
        '#!/bin/sh',
        'if [ ! -e "$OPAX_TEST_SLOW_MARK" ]; then',
        '  : > "$OPAX_TEST_SLOW_MARK"',
        '  exec sleep 60',
        'fi',
        'PATH="$OPAX_TEST_REAL_PATH" exec npm "$@"',
        '',
      ].join('\n'),
    );
    chmodSync(shim, 0o755);
    const env = {
      PATH: `${dir}:${process.env.PATH}`,
      OPAX_TEST_REAL_PATH: process.env.PATH ?? '',
      OPAX_TEST_SLOW_MARK: join(dir, 'slow-start-used'),
    };
    const registry = await silentRegistry();
    try {
      const runs = await boundedAgainstSilentRegistry(registry, 4, env);
      // The first run was bounded but never asked: what the old single
      // count saw as requests=0. A later run met the registry; under load a
      // real npm can be stopped early too, so how many it took is not fixed.
      expect(runs[0]!.asked).toBe(false);
      expect(runs.at(-1)!.asked).toBe(true);
      expect(runs.length).toBeGreaterThanOrEqual(2);
      expect(registry.requests()).toBeGreaterThan(0);
    } finally {
      await registry.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
  4 * stepLimit + 10000,
);
test.each([
  { stdout: 'broken', stderr: '' },
  { stdout: '{}', stderr: '' },
  { stdout: JSON.stringify({ error: { code: 'E401' } }), stderr: '' },
  { stdout: JSON.stringify({ error: { code: 'ENOLOCK' } }), stderr: '' },
  { stdout: '', stderr: '', error: new Error('npm missing') },
])('unexpected/local audit failures still fail closed: %s', (result) => {
  expect(() => checkAdvisoryAudit(result, accepted)).toThrow();
});
