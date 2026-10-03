// Sample only the installed app processes on the selected simulator. Sampling
// cannot see connections opened and closed between samples; keep raw evidence.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lookup } from 'node:dns/promises';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const exec = promisify(execFile);
const [udid, output] = process.argv.slice(2);
if (!udid || !output)
  throw new Error('Usage: connection-audit.ts <udid> <output>');
async function main(udid: string, output: string) {
  const addresses = await lookup('opax.com.au', { all: true }).catch(() => []);
  const ips = new Set(addresses.map((row) => row.address));
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.on(signal, () => {
      stopping = true;
    });
  const pids = new Set<string>();
  let samples = 0,
    processSamples = 0,
    observedConnections = 0,
    productionConnections = 0;
  const external = new Set<string>();
  const errors: string[] = [];
  while (!stopping) {
    const started = Date.now();
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
      for (const pid of appPids) {
        pids.add(pid);
        processSamples++;
        let raw = '';
        try {
          raw = (
            await exec(
              '/usr/sbin/lsof',
              ['-nP', '-a', '-p', pid, '-i', '-FpcnT'],
              { timeout: 3000 },
            )
          ).stdout;
        } catch (error) {
          // lsof exits 1 when a live process has no network sockets, including
          // during offline journeys and startup. Other errors fail the audit.
          if ((error as { code: unknown }).code !== 1) throw error;
        }
        const names = raw
          .split('\n')
          .filter((line) => line.startsWith('n'))
          .map((line) => line.slice(1));
        for (const name of names) {
          const remote = name.split('->')[1];
          if (!remote) continue;
          observedConnections++;
          const host = remote.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
          if (ips.has(host) || host === 'opax.com.au') productionConnections++;
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
      errors.push(String(error));
    }
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 250 - (Date.now() - started))),
    );
  }
  const audit = {
    samples,
    processSamples,
    pids: [...pids],
    observedConnections,
    productionConnections,
    nonLoopbackConnections: [...external],
    productionAddresses: addresses,
    errors,
    basis:
      'lsof -a -p <app-pid> -i; simulator launchctl app PIDs only, nominal 250ms interval',
    limitation: 'Connections shorter than the interval may be missed.',
    pass:
      processSamples > 0 &&
      errors.length === 0 &&
      productionConnections === 0 &&
      external.size === 0,
  };
  writeFileSync(
    join(output, 'connection-audit.json'),
    JSON.stringify(audit, null, 2),
  );
  console.log(JSON.stringify(audit));
  process.exitCode = audit.pass ? 0 : 1;
}
void main(udid, output);
