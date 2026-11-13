/**
 * Reads the in-app timing probe (src/perf/probe.ts). Local measurement only:
 * the probe exists in e2e builds launched with `-OPAXPerfProbe on`.
 *
 *   npx tsx scripts/perf-probe.ts pull <udid> <file>
 *     Moves the app's Documents/opax-perf-marks.json off a simulator.
 *   npx tsx scripts/perf-probe.ts report <file or directory>...
 *     Median and p90 of each measure, per directory.
 *
 * One file is one launch. Measures, in ms: Today's first bill row from the
 * first JS module; then each deep link to a profile in order (open 1, 2...),
 * its first render and its content drawn, from the link reaching JS; the
 * idle preload's time and its Hermes allocation; Hermes allocated bytes
 * when the first link arrived.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

type Mark = [name: string, at: number, detail?: string | number[]];
export type ProbeFile = { bundle: number; marks: Mark[] };

const MB = 1024 * 1024;
/** Each measure this launch recorded, by name. */
export function measures(file: ProbeFile): Record<string, number> {
  const out: Record<string, number> = {};
  const { marks } = file;
  const at = (name: string, from = 0) =>
    marks.findIndex(([n], i) => i >= from && n === name);
  const bill = at('today-bill-0');
  if (bill >= 0) out['today-bill-0 render'] = marks[bill]![1] - file.bundle;
  let open = 0;
  marks.forEach(([name, t, detail], i) => {
    if (name !== 'intent' || !String(detail).includes('/person/')) return;
    open++;
    const render = at('profile-render', i);
    const drawn = at('profile-drawn', i);
    const end = marks.findIndex(
      ([n, , d], j) =>
        j > i && n === 'intent' && String(d).includes('/person/'),
    );
    const within = (j: number) => j >= 0 && (end < 0 || j < end);
    if (within(render)) {
      out[`open ${open} render`] = marks[render]![1] - t;
      out[`open ${open} from memory`] = marks[render]![2] === 'memo' ? 1 : 0;
    }
    if (within(drawn)) out[`open ${open} drawn`] = marks[drawn]![1] - t;
    if (open === 1) {
      const heap = marks[i + 1];
      if (heap?.[0] === 'intent-heap' && Array.isArray(heap[2]))
        out['heap at first link MB'] = heap[2][0]! / MB;
    }
  });
  const start = at('preload-start');
  const done = marks.findIndex(([n]) =>
    /^preload-(done|cancelled|unavailable)$/.test(n),
  );
  if (start >= 0 && done >= 0) {
    out['preload ms'] = marks[done]![1] - marks[start]![1];
    out['preload finished'] = marks[done]![0] === 'preload-done' ? 1 : 0;
    out['preload reads'] = marks.filter(([n]) => n === 'preload-read').length;
  }
  const h0 = marks.find(([n]) => n === 'preload-heap-start')?.[2];
  const h1 = marks.find(([n]) => n === 'preload-heap-end')?.[2];
  if (Array.isArray(h0) && Array.isArray(h1)) {
    out['preload allocated MB'] = (h1[0]! - h0[0]!) / MB;
    out['preload GCs'] = h1[2]! - h0[2]!;
  }
  return out;
}

export function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const median =
    n % 2 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
  // Nearest rank.
  const p90 = sorted[Math.max(0, Math.ceil(0.9 * n) - 1)]!;
  return { n, median, p90, min: sorted[0]!, max: sorted[n - 1]! };
}

function files(paths: string[]) {
  return paths.flatMap((path) =>
    statSync(path).isDirectory()
      ? readdirSync(path)
          .filter((name) => name.endsWith('.json'))
          .sort()
          .map((name) => join(path, name))
      : [path],
  );
}

export function report(paths: string[]) {
  const groups = new Map<string, Map<string, number[]>>();
  for (const path of files(paths)) {
    let file: ProbeFile;
    try {
      file = JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(file.marks)) continue;
    const group = basename(dirname(path));
    const values = groups.get(group) ?? new Map<string, number[]>();
    groups.set(group, values);
    for (const [name, value] of Object.entries(measures(file)))
      values.set(name, [...(values.get(name) ?? []), value]);
  }
  const fixed = (v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(0));
  const lines = [
    '| group | measure | n | median | p90 | min | max |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const [group, values] of groups)
    for (const [name, list] of values) {
      const q = quantiles(list);
      lines.push(
        `| ${group} | ${name} | ${q.n} | ${fixed(q.median)} | ${fixed(q.p90)} | ${fixed(q.min)} | ${fixed(q.max)} |`,
      );
    }
  return lines.join('\n');
}

function pull(udid: string, destination: string) {
  const container = execFileSync(
    'xcrun',
    ['simctl', 'get_app_container', udid, 'au.com.opax.app', 'data'],
    { encoding: 'utf8' },
  ).trim();
  const source = join(container, 'Documents', 'opax-perf-marks.json');
  if (!existsSync(source)) return false;
  copyFileSync(source, destination);
  rmSync(source);
  return true;
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'pull' && args.length === 2) {
    if (!pull(args[0]!, args[1]!)) {
      console.error('No marks: was the app launched with -OPAXPerfProbe on?');
      process.exit(1);
    }
  } else if (command === 'report' && args.length) console.log(report(args));
  else {
    console.error(
      'Usage: perf-probe.ts pull <udid> <file> | report <file or directory>...',
    );
    process.exit(2);
  }
}
