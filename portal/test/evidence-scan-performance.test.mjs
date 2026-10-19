import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('evidence scan preserves the frozen Python output and cache boundaries', {timeout: 60_000}, () => {
  const result = spawnSync('python3', [
    '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_evidence_scan_performance.py',
  ], {
    cwd: new URL('../../', import.meta.url),
    encoding: 'utf8',
    timeout: 55_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stderr, /Ran [1-9]\d* tests/);
  assert.doesNotMatch(result.stderr, /skipped=/);
});
