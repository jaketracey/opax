import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildSlimAssets, countFiles, FD_LIMIT, isBulkAssetPath, MAX_ASSET_FILES, PARTIAL_FOLDERS, SKIPPED_FOLDERS, stopGroup, stopGroupOnExit, waitForHealth} from '../../scripts/research_local_assets.mjs';

const portal = fileURLToPath(new URL('../', import.meta.url));
const write = (path, body = '{}') => { mkdirSync(join(path, '..'), {recursive: true}); writeFileSync(path, body); };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'research-assets-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const pub = join(root, 'public');
  for (const folder of SKIPPED_FOLDERS) for (let i = 0; i < 3; i++) write(join(pub, folder, `x${i}.json`));
  write(join(pub, 'index.html'), '<!doctype html>');
  for (const name of ['annual-report-x.json', 'integrity-report-y.json', 'royal-commission-cth-example.json']) write(join(pub, 'report-records', name));
  write(join(pub, 'agencies', 'a.json'));
  write(join(pub, 'electorates', 'manifest.json'), JSON.stringify({release_id: 'new1', index_url: '/electorates/releases/new1/index.json'}));
  for (const release of ['old1', 'old2', 'new1']) for (let i = 0; i < 4; i++) write(join(pub, 'electorates', 'releases', release, `el_${i}.json`));
  return {root, pub, slim: join(root, 'slim')};
}

test('the slim folder leaves out the bulk and unread folders and keeps only the current electorate release', t => {
  const {pub, slim} = fixture(t);
  const result = buildSlimAssets(pub, slim);
  assert.deepEqual(result.skipped, [...SKIPPED_FOLDERS].sort());
  assert.deepEqual(result.trimmed, ['electorates (release new1 only)', `report-records (${PARTIAL_FOLDERS['report-records'].source} only)`]);
  for (const folder of SKIPPED_FOLDERS) assert.equal(existsSync(join(slim, folder)), false, folder);
  // Only the royal commission report records, whose findings Ask reads.
  assert.deepEqual(readdirSync(join(slim, 'report-records')), ['royal-commission-cth-example.json']);
  assert.deepEqual(readdirSync(join(slim, 'electorates', 'releases')), ['new1']);
  assert.ok(lstatSync(join(slim, 'agencies')).isSymbolicLink());
  // index.html + agencies/a.json + manifest + 4 current-release files + 1 royal commission record
  assert.equal(result.files, 8);
  assert.equal(countFiles(slim), 8);
});

test('the slim folder rebuilds cleanly over a previous one', t => {
  const {pub, slim} = fixture(t);
  buildSlimAssets(pub, slim);
  assert.equal(buildSlimAssets(pub, slim).files, 8);
});

test('an electorates folder without a usable manifest is kept whole rather than guessed at', t => {
  const {pub, slim} = fixture(t);
  writeFileSync(join(pub, 'electorates', 'manifest.json'), JSON.stringify({release_id: 'missing'}));
  const result = buildSlimAssets(pub, slim);
  assert.deepEqual(result.trimmed, [`report-records (${PARTIAL_FOLDERS['report-records'].source} only)`]);
  assert.equal(result.files, 2 + 1 + 12 + 1);
});

test('a slim folder over the limit fails before wrangler starts, naming the largest folders', t => {
  const {pub, slim} = fixture(t);
  for (let i = 0; i < 10; i++) write(join(pub, 'evidence', `e${i}.json`));
  assert.throws(() => buildSlimAssets(pub, slim, {max: 12}), err => {
    assert.match(err.message, /has 18 files, over the 12 limit/);
    assert.match(err.message, new RegExp(`ulimit -n ${FD_LIMIT}`));
    assert.match(err.message, /Largest folders: evidence 10/);
    return true;
  });
});

test('the limit leaves room under the open-file limit wrangler runs with', () => {
  assert.ok(MAX_ASSET_FILES <= FD_LIMIT * 0.75, `${MAX_ASSET_FILES} vs ${FD_LIMIT}`);
});

test('this checkout\'s real slim folder is under the limit', {skip: !existsSync(join(portal, 'public', 'index.html')) && 'portal/public is not built'}, t => {
  const slim = mkdtempSync(join(tmpdir(), 'research-assets-real-'));
  t.after(() => rmSync(slim, {recursive: true, force: true}));
  const {files} = buildSlimAssets(join(portal, 'public'), slim);
  assert.ok(files > 0 && files <= MAX_ASSET_FILES, String(files));
});

test('Ask code never reads a skipped folder through the Worker assets, except the bulk folders the harness serves itself', () => {
  const src = join(portal, 'src');
  const files = [...readdirSync(join(src, 'tools')).map(f => join(src, 'tools', f)),
    ...readdirSync(src).filter(f => /^(?:ask|research)[\w-]*\.ts$/.test(f)).map(f => join(src, f))];
  const unread = SKIPPED_FOLDERS.filter(f => !['bills', 'divisions', 'grants'].includes(f));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const folder of unread) assert.doesNotMatch(text, new RegExp(`['\`"]/${folder}/`), `${file} reads /${folder}/`);
    // A partly linked folder is read only by the names the slim folder links.
    for (const [folder, only] of Object.entries(PARTIAL_FOLDERS))
      for (const m of text.matchAll(new RegExp(`['\`"]/${folder}/([^'\`"]*)`, 'g'))) assert.match(m[1].replace(/\$\{[^}]+\}/g, 'x'), only, `${file} reads /${folder}/${m[1]}`);
  }
});

test('the bulk server accepts nested bill, division and grant JSON paths and nothing else', () => {
  for (const ok of ['/bills/index.json', '/divisions/division-123.json', '/grants/federal/shard-07.json', '/grants/qld/programs/abc_1.json'])
    assert.ok(isBulkAssetPath(ok), ok);
  for (const bad of ['/grants/../.dev.vars', '/bills/../x.json', '/grants/x.txt', '/photos/a.json', '/bills/', '/bills/.hidden.json'])
    assert.equal(isBulkAssetPath(bad), false, bad);
});

test('the health wait gives up at its limit', async () => {
  const result = await waitForHealth(async () => false, {timeoutMs: 120, intervalMs: 20});
  assert.equal(result.ok, false);
  assert.ok(result.ms >= 120 && result.ms < 1000, String(result.ms));
  assert.deepEqual(await waitForHealth(async () => true).then(r => r.ok), true);
  let calls = 0;
  const early = await waitForHealth(async () => (calls++, false), {timeoutMs: 5000, intervalMs: 20, failed: () => calls >= 2});
  assert.equal(early.ok, false);
  assert.ok(early.ms < 1000);
});

const groupAlive = pid => { try { process.kill(-pid, 0); return true; } catch { return false; } };
function startGroup(script) {
  const child = spawn('bash', ['-c', script], {detached: true, stdio: 'ignore'});
  return new Promise(resolve => setTimeout(() => resolve(child), 200));
}

test('stopping the group ends a process group that obeys SIGTERM', {skip: process.platform === 'win32'}, async () => {
  const child = await startGroup('sleep 30 & sleep 30 & wait');
  assert.equal(await stopGroup(child.pid, {graceMs: 3000}), 'term');
  assert.equal(groupAlive(child.pid), false);
});

test('stopping the group kills one that ignores SIGTERM after the grace period', {skip: process.platform === 'win32'}, async () => {
  const child = await startGroup('trap "" TERM; sleep 30 & sleep 30 & wait; wait; sleep 30');
  // bash ignores TERM; its sleeps inherit the ignored disposition too.
  const t0 = Date.now();
  assert.equal(await stopGroup(child.pid, {graceMs: 400}), 'kill');
  assert.ok(Date.now() - t0 >= 400);
  await new Promise(r => setTimeout(r, 100));
  assert.equal(groupAlive(child.pid), false);
});

test('the exit fallback terms the group now and kills what ignores it shortly after', {skip: process.platform === 'win32'}, async () => {
  const child = await startGroup('trap "" TERM; sleep 30 & sleep 30 & wait; wait; sleep 30');
  assert.equal(stopGroupOnExit(child.pid, {graceMs: 300}), true);
  assert.equal(groupAlive(child.pid), true);
  for (let i = 0; i < 40 && groupAlive(child.pid); i++) await new Promise(r => setTimeout(r, 100));
  assert.equal(groupAlive(child.pid), false);
});

test('stopping a group that has already gone, or a non-group pid, does nothing', async () => {
  assert.equal(await stopGroup(2 ** 22 - 7), 'gone');
  assert.equal(await stopGroup(0), 'gone');
  assert.equal(await stopGroup(1), 'gone');
  assert.equal(stopGroupOnExit(1), false);
});
