import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildTableAssets,tableMetadataOnly} from '../../scripts/load_tables.mjs';
test('metadata-only releases perform no source reads or writes; SQL reloads build ordinary table data',async t=>{
 const root=await mkdtemp(join(tmpdir(),'opax-table-build-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const output=join(root,'private/sql');await mkdir(output,{recursive:true});await writeFile(join(output,'sentinel.sql'),'existing reload input');
 assert.deepEqual(await buildTableAssets({root,output,metadataOnly:true}),{publicAssets:0});
 assert.equal(await readFile(join(output,'sentinel.sql'),'utf8'),'existing reload input');
 assert.deepEqual((await readdir(root)).sort(),['private']);
 const result=await buildTableAssets({root,output,datasets:{},metadataOnly:false});assert.ok(result.files.length>0);
 assert.equal(Object.hasOwn(result,'privacyFingerprint'),false);assert.equal(Object.hasOwn(result,'privateIdentities'),false);
 assert.deepEqual((await readdir(root)).sort(),['private']);
});
test('SQL remains the default and explicit reload mode overrides the CI environment', () => {
  assert.equal(tableMetadataOnly([], {}), false);
  assert.equal(tableMetadataOnly(['--metadata-only'], {}), true);
  assert.equal(tableMetadataOnly([], {OPAX_TABLE_METADATA_ONLY: '1'}), true);
  assert.equal(tableMetadataOnly(['--sql'], {OPAX_TABLE_METADATA_ONLY: '1'}), false);
  assert.throws(() => tableMetadataOnly(['--metadata-only', '--sql'], {}), /Conflicting/);
});
