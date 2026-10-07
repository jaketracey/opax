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
assert(values.length, 'No native drawn-title timing in this run');
assert(
  values.every((n) => n < 2000),
  'Party title exceeded 2 seconds',
);
console.log(
  JSON.stringify(
    {
      valuesMs: values,
      limitMs: 2000,
      basis:
        'partyRoute resolution in press handler to title native TextKit layout; e2e Release build',
    },
    null,
    2,
  ),
);
