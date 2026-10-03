import { spawnSync } from 'node:child_process';
import baseline from './advisory-baseline.json';
import { advisoryTimeoutMs, checkAdvisoryAudit } from './advisory-audit';
const result = spawnSync(
  'npm',
  [
    'audit',
    '--json',
    '--fetch-retries=0',
    `--fetch-timeout=${advisoryTimeoutMs}`,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    // npm's fetch timeout does not bound a stalled TCP connect. Bound the whole
    // audit process, and force termination even if npm handles SIGTERM itself.
    timeout: advisoryTimeoutMs,
    killSignal: 'SIGKILL',
  },
);
const message = checkAdvisoryAudit(result, baseline.accepted);
if (message.startsWith('WARNING')) console.warn(message);
else console.log(message);
