// The generators that read portal exports stop on exports older than main's
// (scripts/export-freshness.mjs): the app line's own portal/public is a
// September 2026 snapshot that looks current (portal/public/README.md).
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scripts = resolve(__dirname, '../scripts');
const repo = resolve(__dirname, '../..');
const freshness = pathToFileURL(resolve(scripts, 'export-freshness.mjs')).href;
const runNode = (code: string) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      encoding: 'utf8',
    }),
  );
const hasMain = (() => {
  try {
    execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}'],
      {
        cwd: repo,
        stdio: 'ignore',
      },
    );
    return true;
  } catch {
    return false;
  }
})();

/** A public folder holding `files` (path to JSON value). */
function publicDir(files: Record<string, unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'export-freshness-'));
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), JSON.stringify(value));
  }
  return dir;
}

/** What assertExportsCurrent says of `here` against `main` (path to JSON value, or absent). */
function check(
  here: Record<string, unknown>,
  main: Record<string, unknown>,
  paths: string[],
) {
  const dir = publicDir(here);
  try {
    return runNode(`
      import { assertExportsCurrent } from ${JSON.stringify(freshness)};
      const main = ${JSON.stringify(main)};
      const readMain = (p) => (p in main ? JSON.stringify(main[p]) : null);
      try { assertExportsCurrent(${JSON.stringify(dir)}, ${JSON.stringify(paths)}, { readMain }); console.log(JSON.stringify('ok')); }
      catch (e) { console.log(JSON.stringify(e.message)); }
    `) as string;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('reads the date each export carries: generated_at or generated, at the top or under meta', () => {
  const dates = runNode(`
    import { exportDate } from ${JSON.stringify(freshness)};
    console.log(JSON.stringify([
      { generated_at: '2026-10-04T16:27:54+00:00' },
      { meta: { generated_at: '2026-11-15T16:39:04.982606+00:00' } },
      { generated: '2026-11-16' },
      { meta: { generated: '2026-11-11' } },
      { meta: { counts: 1 } },
      { generated_at: 'soon' },
    ].map(exportDate)));
  `);
  expect(dates).toEqual([
    '2026-10-04T16:27:54+00:00',
    '2026-11-15T16:39:04.982606+00:00',
    '2026-11-16',
    '2026-11-11',
    null,
    null,
  ]);
});

test('an export older than main, missing or undated where main has it stops the generator, naming every file', () => {
  const message = check(
    {
      'agencies.json': { meta: { generated_at: '2026-09-21T12:40:24+00:00' } },
      'bills/index.json': { bills: [] },
    },
    {
      'agencies.json': { meta: { generated_at: '2026-11-15T16:39:04+00:00' } },
      'bills/index.json': { generated_at: '2026-10-04T16:27:54+00:00' },
      'divisions/index.json': { divisions: [] },
    },
    ['agencies.json', 'bills/index.json', 'divisions/index.json'],
  );
  expect(message).toContain('older than main');
  expect(message).toContain(
    'agencies.json: 2026-09-21T12:40:24+00:00 here, 2026-11-15T16:39:04+00:00 on main',
  );
  expect(message).toContain(
    'bills/index.json: undated here, 2026-10-04T16:27:54+00:00 on main',
  );
  expect(message).toContain('divisions/index.json: missing here, on main');
  expect(message).toContain('--portal <main checkout>/portal');
});

test('the same date or a later one passes, and a file main lacks is not compared', () => {
  const main = { 'graph/money.json': { meta: { generated: '2026-11-11' } } };
  expect(
    check({ 'graph/money.json': { meta: { generated: '2026-11-11' } } }, main, [
      'graph/money.json',
    ]),
  ).toBe('ok');
  expect(
    check({ 'graph/money.json': { meta: { generated: '2026-11-17' } } }, main, [
      'graph/money.json',
    ]),
  ).toBe('ok');
  expect(check({}, {}, ['years/index.json'])).toBe('ok');
});

test('every generator that reads exports checks them before it reads or writes anything else', () => {
  for (const [name, paths] of [
    [
      'generate-today-question.mjs',
      ["'bills/index.json'", "'agencies.json'", "'divisions/index.json'"],
    ],
    ['generate-explore.mjs', ["'graph/money.json'", "'years/index.json'"]],
    ['generate-state-outlines.mjs', ["'electorates/manifest.json'"]],
  ] as const) {
    const source = readFileSync(resolve(scripts, name), 'utf8');
    const call = source.indexOf('assertExportsCurrent(publicRoot');
    expect(call).toBeGreaterThan(0);
    for (const path of paths)
      expect(source.slice(call, call + 200)).toContain(path);
    for (const later of [
      'loadTodayInputs(publicRoot)',
      'loadEngine(publicRoot)',
      'readFileSync(',
      'writeFileSync(',
      'mkdirSync(',
    ])
      if (source.includes(later))
        expect(source.indexOf(later)).toBeGreaterThan(call);
  }
});

(hasMain ? test : test.skip)(
  "this branch's own snapshot is refused against origin/main, read through git: the Explore generator writes nothing",
  () => {
    const out = mkdtempSync(join(tmpdir(), 'export-freshness-out-'));
    try {
      const run = spawnSync(
        process.execPath,
        [
          resolve(scripts, 'generate-explore.mjs'),
          '--portal',
          resolve(repo, 'portal'),
          '--out',
          out,
        ],
        { encoding: 'utf8' },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain('graph/money.json: 2026-09-21 here');
      expect(execFileSync('ls', [out], { encoding: 'utf8' })).toBe('');
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  },
);
