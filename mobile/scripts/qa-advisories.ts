import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import baseline from './advisory-baseline.json';
import { unacceptedAdvisories, type AuditRoot } from './advisory-policy';
const result = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (result.error) throw result.error;
const audit = JSON.parse(result.stdout);
assert(!audit.error, `Audit unavailable: ${JSON.stringify(audit.error)}`);
assert(audit.vulnerabilities, 'Audit returned no vulnerability inventory');
const roots: AuditRoot[] = [];
for (const [name, vulnerability] of Object.entries(audit.vulnerabilities))
  for (const via of (vulnerability as { via: (string | { url: string })[] })
    .via)
    if (typeof via !== 'string') roots.push({ name, url: via.url });
assert.deepEqual(
  unacceptedAdvisories(roots, baseline.accepted),
  [],
  'New/unaccepted advisory: review runtime exposure and upgrade safely; never npm audit fix --force',
);
console.log(
  `PASS advisory baseline: ${roots.length} accepted roots; new runtime or unclassified advisories fail`,
);
