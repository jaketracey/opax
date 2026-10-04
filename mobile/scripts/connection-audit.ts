// Sample only the installed app processes on the selected simulator. Sampling
// cannot see connections opened and closed between samples; keep raw evidence.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  connectionAuditPass,
  SampleGaps,
  SAMPLE_GAP_LIMIT_MS,
  SAMPLE_INTERVAL_MS,
} from './connection-audit-policy';
const exec = promisify(execFile);
const [udid, output] = process.argv.slice(2);
if (!udid || !output)
  throw new Error('Usage: connection-audit.ts <udid> <output>');
async function main(udid: string, output: string) {
  const gaps = new SampleGaps(performance.now());
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      stopping = true;
    });
  const pids = new Set<string>();
  let samples = 0,
    longestSampleMs = 0,
    processSamples = 0,
    observedConnections = 0,
    productionConnections = 0;
  const external = new Set<string>();
  const errors: string[] = [];
  while (!stopping) {
    const started = performance.now();
    gaps.sampleStarted(started);
    try {
      // launchctl is scoped to this simulator. App argv/ps executable paths
      // are not stable across simulator releases or Maestro clear-state.
      const { stdout } = await exec(
        '/usr/bin/xcrun',
        ['simctl', 'spawn', udid, 'launchctl', 'list'],
        {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        },
      );
      const appPids = [
        ...new Set(
          stdout
            .split('\n')
            .filter((line) =>
              /(?:UIKitApplication:|application\.)au\.com\.opax\.app(?:\[|\.|\s|$)/.test(
                line,
              ),
            )
            .map((line) => /^\s*(\d+)\s/.exec(line)?.[1])
            .filter((pid): pid is string => !!pid && Number(pid) > 0),
        ),
      ];
      gaps.activeProcesses(appPids);
      for (const pid of appPids) {
        pids.add(pid);
        processSamples++;
        let raw = '';
        try {
          raw = (
            await exec(
              '/usr/sbin/lsof',
              ['-nP', '-a', '-p', pid, '-i', '-FpcnT'],
              { timeout: 10000 },
            )
          ).stdout;
        } catch (error) {
          // lsof exits 1 when a live process has no network sockets, including
          // during offline journeys and startup. Other errors fail the audit.
          if ((error as { code: unknown }).code !== 1) throw error;
        }
        gaps.processSampled(pid, performance.now());
        const names = raw
          .split('\n')
          .filter((line) => line.startsWith('n'))
          .map((line) => line.slice(1));
        for (const name of names) {
          const remote = name.split('->')[1];
          if (!remote) continue;
          observedConnections++;
          const host = remote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
          if (host === 'opax.com.au') productionConnections++;
          if (!['127.0.0.1', '::1'].includes(host)) external.add(name);
        }
        appendFileSync(
          join(output, 'connection-samples.jsonl'),
          JSON.stringify({ at: new Date().toISOString(), pid, names, raw }) +
            '\n',
        );
      }
      samples++;
    } catch (error) {
      const failure = error as {
        code?: unknown;
        signal?: unknown;
        killed?: unknown;
      };
      errors.push(
        JSON.stringify({
          message: String(error),
          code: failure.code,
          signal: failure.signal,
          killed: failure.killed,
        }),
      );
    }
    const completed = performance.now();
    longestSampleMs = Math.max(longestSampleMs, completed - started);
    gaps.check(completed);
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(0, SAMPLE_INTERVAL_MS - (performance.now() - started)),
      ),
    );
  }
  // Include a slow last sample or delayed shutdown even without another poll.
  gaps.check(performance.now());
  const nonLoopbackConnections = [...external];
  const proof = {
    processSamples,
    errors,
    productionConnections,
    nonLoopbackConnections,
    longestSampleGapMs: gaps.longestSampleGapMs,
  };
  const audit = {
    samples,
    longestSampleMs,
    processSamples,
    pids: [...pids],
    observedConnections,
    productionConnections,
    nonLoopbackConnections,
    longestSampleGapMs: gaps.longestSampleGapMs,
    sampleGapLimitMs: SAMPLE_GAP_LIMIT_MS,
    errors,
    basis:
      'lsof -a -p <app-pid> -i; simulator launchctl app PIDs only, nominal 250ms interval; no DNS or outbound probes',
    limitation: 'Connections shorter than the interval may be missed.',
    pass: connectionAuditPass(proof),
  };
  writeFileSync(
    join(output, 'connection-audit.json'),
    JSON.stringify(audit, null, 2),
  );
  console.log(JSON.stringify(audit));
  process.exitCode = audit.pass ? 0 : 1;
}
void main(udid, output);
