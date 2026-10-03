import { checkAdvisoryAudit } from '../scripts/advisory-audit';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

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
test('the real advisory step bounds a registry that accepts requests but never responds', async () => {
  let requests = 0;
  const registry = createServer(() => {
    requests++;
  });
  await new Promise<void>((resolve) =>
    registry.listen(0, '127.0.0.1', resolve),
  );
  try {
    const port = (registry.address() as AddressInfo).port;
    const started = Date.now();
    const result = await new Promise<{
      error: Error | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      execFile(
        process.execPath,
        [require.resolve('tsx/cli'), 'scripts/qa-advisories.ts'],
        {
          env: {
            ...process.env,
            npm_config_registry: `http://127.0.0.1:${port}`,
            npm_config_proxy: '',
            npm_config_https_proxy: '',
          },
          timeout: 15000,
          killSignal: 'SIGKILL',
        },
        (error, stdout, stderr) => resolve({ error, stdout, stderr }),
      );
    });
    expect(requests).toBeGreaterThan(0);
    expect(result.error).toBeNull();
    expect(result.stderr).toMatch(
      /^WARNING: ADVISORY AUDIT SKIPPED.*did not respond within 8s.*NOT checked/m,
    );
    expect(Date.now() - started).toBeLessThan(15000);
  } finally {
    registry.closeAllConnections();
    await new Promise<void>((resolve) => registry.close(() => resolve()));
  }
}, 20000);
test.each([
  { stdout: 'broken', stderr: '' },
  { stdout: '{}', stderr: '' },
  { stdout: JSON.stringify({ error: { code: 'E401' } }), stderr: '' },
  { stdout: JSON.stringify({ error: { code: 'ENOLOCK' } }), stderr: '' },
  { stdout: '', stderr: '', error: new Error('npm missing') },
])('unexpected/local audit failures still fail closed: %s', (result) => {
  expect(() => checkAdvisoryAudit(result, accepted)).toThrow();
});
