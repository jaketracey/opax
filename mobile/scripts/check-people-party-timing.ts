// Read the native TextKit title timing saved in Maestro's accessibility tree.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const paths: string[] = [];
function walk(path: string) {
  if (statSync(path).isDirectory())
    for (const name of readdirSync(path)) walk(join(path, name));
  else if (path.endsWith('.json')) paths.push(path);
}
walk(process.argv[2]!);
const values = [
  ...new Set(
    paths.flatMap((path) =>
      [
        ...readFileSync(path, 'utf8').matchAll(/people-party-title-ms-(\d+)/g),
      ].map((m) => Number(m[1])),
    ),
  ),
];
// Current Maestro saves a hierarchy only on failure. On a passing run, the
// completed, anchored native-ID assertion is the measured upper-bound proof.
const underLimit = '^people-party-title-ms-([0-9]|[1-9][0-9]|[1-9][0-9][0-9]|1[0-9]{3})$';
const bounded = paths.some((path) => {
  const commands: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(commands) && commands.some((item) =>
    item?.metadata?.status === 'COMPLETED' &&
    item?.metadata?.evaluatedCommand?.assertConditionCommand?.condition?.visible?.idRegex === underLimit,
  );
});
assert(values.length || bounded, 'No native drawn-title timing proof in this run');
assert(
  values.every((n) => n < 2000),
  'Party title exceeded 2 seconds',
);
console.log(
  JSON.stringify(
    {
      valuesMs: values,
      verifiedUpperBoundMs: bounded ? 2000 : null,
      limitMs: 2000,
      basis:
        'partyRoute resolution in press handler to title native TextKit layout; e2e Release build',
    },
    null,
    2,
  ),
);
