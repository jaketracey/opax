import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {INDEPENDENT_BUILDS} from '../../scripts/build_parallel.mjs';
import {CACHED_BUILDS} from '../../scripts/cached_release_build.mjs';
const scripts=JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).scripts;
const workflow=readFileSync(new URL('../../.github/workflows/deploy.yml',import.meta.url),'utf8');
test('release preserves cached search stages and parallel independent builds without withholding sweeps',()=>{
 assert.equal(scripts['build:search'],'npm run build:ask-titles && npm run build:donors && npm run build:parties && npm run build:tokens && npm run build:registers && node ../scripts/cached_release_build.mjs passage-names && node ../scripts/build_search_catalog.mjs && npm run build:growth && npm run build:hubs && node ../scripts/cached_release_build.mjs crawl && npm run build:vic-election && npm run build:tables');
 assert.equal(scripts['build:release'],'npm run build:search && npm run build:independent && node ../scripts/stamp_assets.mjs && node ../scripts/photo_identity.mjs --deploy');
 assert.equal(scripts['build:independent'],'node ../scripts/build_parallel.mjs');
 assert.deepEqual(INDEPENDENT_BUILDS,{social:['../scripts/build_social_catalog.mjs'],'grants-map':['grants-map/build.mjs'],analytics:['analytics/build.mjs'],voice:['voice/build.mjs']});
 assert.deepEqual(Object.keys(CACHED_BUILDS),['passage-names','crawl']);
 for(const key of ['build:privacy','build:table-privacy','test:privacy'])assert.equal(scripts[key],undefined);
 for(const [key,value]of Object.entries(scripts))if(/build|deploy/.test(key))assert.doesNotMatch(value,/withhold_donor_assets|check_privacy_placeholders|build:privacy|test:privacy|build:table-privacy/);
 assert.equal(scripts['deploy:built'],'wrangler deploy');
});
test('CI retains duplicate-deploy skipping, cache modes, receipts and nonfatal restamp failure',()=>{
 assert.match(workflow,/require\('\.\/scripts\/deploy-duplicate\.cjs'\)/);
 assert.match(workflow,/OPAX_TABLE_METADATA_ONLY: '1'/);assert.match(workflow,/OPAX_RELEASE_CACHE_DIR: \.\.\/\.cache\/release-build/);
 assert.match(workflow,/run: npm run build:release/);assert.match(workflow,/run: npm run deploy:built/);
 assert.match(workflow,/createDeployment\(/);assert.match(workflow,/steps\.duplicate\.outputs\.skip != 'true'/);
 assert.match(workflow,/::warning::could not push the restamp commit/);assert.match(workflow,/production is already deployed"\n          exit 0/);
 assert.doesNotMatch(workflow,/build:privacy|test:privacy|privacy before Wrangler/);
 assert.ok(existsSync(new URL('../../scripts/deploy-duplicate.cjs',import.meta.url)));
});
