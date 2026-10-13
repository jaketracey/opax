import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTableAssets, tableMetadataOnly} from '../../scripts/load_tables.mjs';
import {compileIdentityCheck, strippedLengths} from '../src/table-identities.mjs';
import {compileHashedIdentityCheck} from '../src/table-identity-hashes.mjs';

test('SQL and metadata-only modes emit byte-identical bound prefilter, fingerprint and identity files without touching the release bundle', async t => {
  const releasePath = new URL('../src/table-identity-prefilter.generated.mjs', import.meta.url);
  const releaseBefore = await readFile(releasePath);
  const releaseRegistry = JSON.parse(await readFile(new URL('../public/table-private-identities.json', import.meta.url)));
  const temporary = await mkdtemp(join(tmpdir(), 'opax-table-metadata-test-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const phrases = new Set(['fixture private person', '12345678901', 'fixture alias']);
  const policy = {phrases, lengths: [1, 2, 3], strippedLengths: strippedLengths(phrases), check: compileIdentityCheck(phrases)};
  const results = [];
  for (const [name, metadataOnly] of [['sql', false], ['metadata', true]]) {
    const root = join(temporary, name), output = join(root, 'private/sql'), fingerprintPath = join(root, 'fingerprint.json');
    await mkdir(root);
    const result = await buildTableAssets({root, output, fingerprintPath, datasets: {}, policy, metadataOnly});
    const prefilterPath = join(root, 'table-identity-prefilter.generated.mjs');
    const privateModule = await readFile(prefilterPath);
    const {prefilter, binding, identityHashes} = await import('data:text/javascript;base64,' + privateModule.toString('base64'));
    const identities = await readFile(join(root, 'table-private-identities.json'));
    const published = JSON.parse(identities);
    assert.equal(binding.registryFingerprint, JSON.parse(await readFile(fingerprintPath)).fingerprint);
    assert.equal(identityHashes.length, published.identities.length);
    const check = compileHashedIdentityCheck(published.identities,published.strippedLengths,prefilter,binding);
    assert.throws(() => compileHashedIdentityCheck(releaseRegistry.identities,releaseRegistry.strippedLengths,prefilter,binding), /Privacy index unavailable/, 'a fixture bundle must not bind the release registry');
    for (const phrase of phrases) assert.equal(check(phrase),true);
    assert.equal(check('unrelated public query'),false);
    results.push({fingerprint: await readFile(fingerprintPath), identities, privateModule, result});
    if (metadataOnly) await assert.rejects(readdir(output), {code: 'ENOENT'});
    else {
      const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
      assert.equal(manifest.privacyFingerprint, JSON.parse(results[0].fingerprint).fingerprint);
    }
  }
  assert.deepEqual(results[0].fingerprint, results[1].fingerprint);
  assert.deepEqual(results[0].identities, results[1].identities);
  assert.deepEqual(results[0].privateModule, results[1].privateModule);
  assert.deepEqual(await readFile(releasePath), releaseBefore, 'fixture builds overwrote the release identity binding');
  assert.equal(results[0].result.privacyFingerprint, results[1].result.privacyFingerprint);
  const root = join(temporary, 'metadata'), output = join(root, 'private/sql');
  await mkdir(output, {recursive: true});
  await writeFile(join(output, 'sentinel.sql'), 'existing reload input');
  await buildTableAssets({root, output, fingerprintPath: join(root, 'fingerprint.json'), policy, metadataOnly: true});
  assert.equal(await readFile(join(output, 'sentinel.sql'), 'utf8'), 'existing reload input');
  assert.deepEqual(await readFile(releasePath), releaseBefore, 'metadata rebuild overwrote the release identity binding');
});

test('SQL remains the default and explicit reload mode overrides the CI environment', () => {
  assert.equal(tableMetadataOnly([], {}), false);
  assert.equal(tableMetadataOnly(['--metadata-only'], {}), true);
  assert.equal(tableMetadataOnly([], {OPAX_TABLE_METADATA_ONLY: '1'}), true);
  assert.equal(tableMetadataOnly(['--sql'], {OPAX_TABLE_METADATA_ONLY: '1'}), false);
  assert.throws(() => tableMetadataOnly(['--metadata-only', '--sql'], {}), /Conflicting/);
});
