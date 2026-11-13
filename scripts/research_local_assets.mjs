// Builds the slim asset folder that `npm run research:local` gives wrangler dev, and the process
// helpers the harness uses to start and stop it. Kept apart from research_local.mjs so tests can
// use them without .dev.vars, a model key or a running Worker.
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

// wrangler dev holds every asset file open, so the slim folder must stay well under the fd limit
// it runs with. The rest of the limit covers node_modules, sockets, workerd and the file watcher.
export const FD_LIMIT = 8192;
export const MAX_ASSET_FILES = 6000;

// Folders Ask does read (tools/division.ts, tools/grants.ts, ask-exact-lookup.ts, ...) but that are
// too large for wrangler: the harness serves their JSON from its own small HTTP server instead.
export const BULK_FOLDERS = Object.freeze(['bills', 'divisions', 'grants']);
export const BULK_PREFIX = new RegExp(`^/(?:${BULK_FOLDERS.join('|')})/`);
export const isBulkAssetPath = pathname => BULK_PREFIX.test(pathname) && /^(?:\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*)+\.json$/.test(pathname);

// Top-level public/ folders left out of the asset folder wrangler sees: the bulk folders above,
// plus ones Ask's research path never reads through env.ASSETS. report-records is read only by the
// official-report pages (src/report-records.ts, src/official-reports.ts); growth and photos are
// page and OG assets. Checked against src/tools, src/ask-*.ts and src/research*.
export const SKIPPED_FOLDERS = Object.freeze([...BULK_FOLDERS, 'growth', 'photos', 'report-records']);

// electorates/ is read by Ask (tools/electorates.ts, tools/grants.ts, ask-identity.ts), but only
// through manifest.json and the release it names; older releases stay behind.
export const CURRENT_RELEASE_ONLY = Object.freeze(['electorates']);

export function countFiles(path) {
  let stat;
  try { stat = statSync(path); } catch { return 0; }
  if (!stat.isDirectory()) return stat.isFile() ? 1 : 0;
  let n = 0;
  for (const name of readdirSync(path)) n += countFiles(join(path, name));
  return n;
}

function currentRelease(folder) {
  try {
    const id = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')).release_id;
    return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) && existsSync(join(folder, 'releases', id)) ? id : null;
  } catch { return null; }
}

/** Replace `slimDir` with symlinks into `publicDir` minus the folders Ask does not read.
 *  Returns the file count wrangler will see; throws before wrangler starts if it is over `max`. */
export function buildSlimAssets(publicDir, slimDir, {max = MAX_ASSET_FILES} = {}) {
  rmSync(slimDir, {recursive: true, force: true});
  mkdirSync(slimDir, {recursive: true});
  const skipped = [], trimmed = [];
  for (const name of readdirSync(publicDir).sort()) {
    const source = join(publicDir, name);
    if (SKIPPED_FOLDERS.includes(name)) { if (existsSync(source)) skipped.push(name); continue; }
    const release = CURRENT_RELEASE_ONLY.includes(name) && lstatSync(source).isDirectory() ? currentRelease(source) : null;
    if (!release) { symlinkSync(source, join(slimDir, name)); continue; }
    mkdirSync(join(slimDir, name, 'releases'), {recursive: true});
    for (const entry of readdirSync(source)) if (entry !== 'releases') symlinkSync(join(source, entry), join(slimDir, name, entry));
    symlinkSync(join(source, 'releases', release), join(slimDir, name, 'releases', release));
    trimmed.push(`${name} (release ${release} only)`);
  }
  const files = countFiles(slimDir);
  if (files > max) {
    const biggest = readdirSync(slimDir).map(name => [name, countFiles(join(slimDir, name))]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    throw new Error(`The research asset folder has ${files} files, over the ${max} limit (wrangler dev runs with ulimit -n ${FD_LIMIT} and holds every asset open). `
      + `Largest folders: ${biggest.map(([n, c]) => `${n} ${c}`).join(', ')}. Add the ones Ask does not read to SKIPPED_FOLDERS in scripts/research_local_assets.mjs.`);
  }
  return {files, skipped, trimmed};
}

const groupAlive = pgid => { try { process.kill(-pgid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const validGroup = pgid => Number.isInteger(pgid) && pgid > 1;

/** Stop the process group led by `pgid` (the harness's own detached child, never any other):
 *  SIGTERM, then SIGKILL if anything in the group is still alive after `graceMs`. Async so Node
 *  can reap the dead child meanwhile. Returns 'gone', 'term' or 'kill'. */
export async function stopGroup(pgid, {graceMs = 5000} = {}) {
  if (!validGroup(pgid) || !groupAlive(pgid)) return 'gone';
  try { process.kill(-pgid, 'SIGTERM'); } catch { return 'gone'; }
  for (const end = Date.now() + graceMs; Date.now() < end;) {
    await new Promise(r => setTimeout(r, 100));
    if (!groupAlive(pgid)) return 'term';
  }
  try { process.kill(-pgid, 'SIGKILL'); } catch {}
  return 'kill';
}

/** For a synchronous process 'exit' (uncaught error, early process.exit): SIGTERM the group now and
 *  leave a detached watchdog that SIGKILLs the same group `graceMs` later if any of it is left. */
export function stopGroupOnExit(pgid, {graceMs = 5000} = {}) {
  if (!validGroup(pgid) || !groupAlive(pgid)) return false;
  try { process.kill(-pgid, 'SIGTERM'); } catch { return false; }
  spawn(process.execPath, ['-e', `setTimeout(() => { try { process.kill(-${pgid}, 'SIGKILL'); } catch {} }, ${Math.round(graceMs)});`],
    {detached: true, stdio: 'ignore'}).unref();
  return true;
}

/** Poll `isUp` until it answers or `timeoutMs` passes; stops early if `failed()` says so. */
export async function waitForHealth(isUp, {timeoutMs = 90_000, intervalMs = 1000, failed = () => false} = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await isUp()) return {ok: true, ms: Date.now() - t0};
    if (failed()) break;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return {ok: false, ms: Date.now() - t0};
}
