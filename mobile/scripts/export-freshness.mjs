// The app release line carries a September 2026 snapshot of portal/public that
// looks current; live data is main's (portal/public/README.md). A generator
// that reads exports checks them here first: it stops when an export is older
// than the same file on main, or missing where main has it. Main's copy is
// read through git (`git show origin/main:portal/public/<path>`), never the
// network.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** An export's own date: `generated_at` or `generated`, at the top or under `meta`. */
export function exportDate(json) {
  for (const at of [json, json?.meta])
    for (const key of ['generated_at', 'generated'])
      if (typeof at?.[key] === 'string' && !Number.isNaN(Date.parse(at[key])))
        return at[key];
  return null;
}

/** Main's copy of portal/public/<path> as text, or null when main has no such file. */
export function mainExport(path, { ref = 'origin/main', cwd = repo } = {}) {
  try {
    execFileSync(
      'git',
      ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`],
      {
        cwd,
        stdio: 'ignore',
      },
    );
  } catch {
    throw new Error(
      `No ${ref} in ${cwd} to compare the exports with. Run git fetch origin main, then generate again.`,
    );
  }
  try {
    return execFileSync('git', ['show', `${ref}:portal/public/${path}`], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/**
 * Throws, naming every file, when one of `paths` (relative to `publicRoot`)
 * is missing where main has it, carries no date where main's copy does, or
 * carries an older date than main's copy. A file main lacks is not compared.
 */
export function assertExportsCurrent(
  publicRoot,
  paths,
  { readMain = mainExport } = {},
) {
  const stale = [];
  for (const path of paths) {
    const main = readMain(path);
    if (main == null) continue;
    const there = exportDate(JSON.parse(main));
    const file = resolve(publicRoot, path);
    if (!existsSync(file)) {
      stale.push(
        `${path}: missing here, on main${there ? ` from ${there}` : ''}`,
      );
      continue;
    }
    if (!there) continue;
    const here = exportDate(JSON.parse(readFileSync(file, 'utf8')));
    if (!here || Date.parse(here) < Date.parse(there))
      stale.push(`${path}: ${here ?? 'undated'} here, ${there} on main`);
  }
  if (stale.length)
    throw new Error(
      `Exports under ${publicRoot} are older than main's:\n  ${stale.join('\n  ')}\n` +
        'Generate from an up-to-date main checkout (--portal <main checkout>/portal). ' +
        "This branch's portal/public is a snapshot: see portal/public/README.md.",
    );
}
