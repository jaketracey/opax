import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INDEPENDENT_BUILDS} from '../../scripts/build_parallel.mjs';
import {CACHED_BUILDS} from '../../scripts/cached_release_build.mjs';

const release = names => names.map(name => `npm run build:${name}`).join(' && ') +
  ' && node ../scripts/stamp_assets.mjs && node ../scripts/photo_identity.mjs --deploy && npm run build:privacy';
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts;
const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');

function covered(s, yaml) {
  // An additional writer must be included here deliberately. Every output is
  // swept after the full pipeline, including stamp/photo and staging's graph.
  if (s['build:release'] !== release(['search', 'independent'])) return false;
  if (s['build:independent'] !== 'node ../scripts/build_parallel.mjs') return false;
  if (s['build:privacy'] !== 'node ../scripts/withhold_donor_assets.mjs && node ../scripts/build_donor_index.mjs') return false;
  if (s['build:tables'] !== 'node ../scripts/load_tables.mjs') return false;
  if (JSON.stringify(Object.fromEntries(Object.entries(CACHED_BUILDS).map(([name, {script, outputs}]) => [name, {script, outputs}]))) !== JSON.stringify({'passage-names':{script:'scripts/build_passage_names.mjs',outputs:['portal/src/passage-names.json']},crawl:{script:'scripts/build_crawl_catalog.mjs',outputs:['portal/public/crawl','portal/public/person-paths.js']}})) return false;
  if (JSON.stringify(INDEPENDENT_BUILDS) !== JSON.stringify({social:['../scripts/build_social_catalog.mjs'],'grants-map':['grants-map/build.mjs'],analytics:['analytics/build.mjs'],voice:['voice/build.mjs']})) return false;
  if (s['build:search'] !== 'npm run build:methods && npm run build:privacy && npm run build:tokens && node ../scripts/cached_release_build.mjs passage-names && node ../scripts/build_search_catalog.mjs && npm run build:growth && npm run build:hubs && node ../scripts/cached_release_build.mjs crawl && npm run build:vic-election && npm run build:tables') return false;
  if (s['build:release:staging'] !== release(['search', 'social', 'grants-map', 'graph', 'analytics', 'voice'])) return false;
  if (s['test:privacy'] !== 'node --test test/donor-publication.test.mjs test/donor-deploy-build.test.mjs') return false;
  if (s.deploy !== 'node ../scripts/check_privacy_placeholders.mjs && npm run build:release && npm run deploy:built') return false;
  if (s['deploy:built'] !== 'node ../scripts/check_privacy_placeholders.mjs && npm run test:privacy && wrangler deploy') return false;
  if (s['deploy:staging'] !== 'node ../scripts/check_privacy_placeholders.mjs && npm run build:release:staging && npm run test:privacy && wrangler deploy --env staging') return false;
  if (Object.entries(s).some(([key, value]) => /^(?:pre|post)(?:deploy(?::built|:staging)?|test:privacy)$/.test(key) && value.trim())) return false;
  const beforeRestamp = yaml.split('      - name: Commit restamped assets back to main')[0];
  const names = [...beforeRestamp.matchAll(/^      - name: (.+)$/gm)].map(m => m[1]);
  if (JSON.stringify(names) !== JSON.stringify(['Check out main', 'Set up Node 24', 'Install', 'Restore passage name build cache', 'Restore crawl build cache', 'Build and sanitise all release assets', 'Test', 'Types', 'Deploy'])) return false;
  const caches = [...beforeRestamp.matchAll(/      - name: Restore (?:passage name|crawl) build cache\n([\s\S]*?)(?=\n      (?:#|- name:))/g)].map(m => m[1]);
  if (caches.length !== 2 || caches.some(block => !block.includes('uses: actions/cache@v4') || block.includes('restore-keys:'))) return false;
  if (!caches[0].includes('path: .cache/release-build/passage-names') || !caches[1].includes('path: .cache/release-build/crawl')) return false;
  if (!beforeRestamp.includes("OPAX_TABLE_METADATA_ONLY: '1'") || !beforeRestamp.includes('OPAX_RELEASE_CACHE_DIR: ../.cache/release-build')) return false;
  const runs = [...beforeRestamp.matchAll(/^        run: ([^\n]+)(?:\n((?:          [^\n]*\n)*))?/gm)]
    .map(m => m[1] === '|' ? m[2].trim().split('\n').map(x => x.trim()).join(' && ') : m[1]);
  return JSON.stringify(runs) === JSON.stringify(['npm ci', 'npm run build:release', 'npm test', 'npx wrangler types && npx tsc --noEmit', 'npm run deploy:built']);
}

test('deploy and CI sweep the same complete asset pipeline before uploading', () => {
  assert.ok(covered(scripts, workflow), 'deploy build/privacy coverage drifted');
});

test('a new deploy or workflow writer cannot escape the privacy coverage guard', () => {
  for (const key of ['build:release', 'build:release:staging', 'build:search', 'build:independent', 'build:privacy', 'build:tables', 'deploy', 'deploy:built', 'deploy:staging']) {
    assert.ok(!covered({...scripts, [key]: scripts[key] + ' && npm run build:future'}, workflow));
  }
  assert.ok(!covered(scripts, workflow.replace('run: npm run build:release', 'run: |\n          npm run build:release\n          npm run build:future')));
  assert.ok(!covered(scripts, workflow.replace('      - name: Deploy', '      - name: Additional writer\n        run: node ../scripts/future_builder.mjs\n\n      - name: Deploy')));
  assert.ok(!covered({...scripts, 'deploy:built': 'wrangler deploy'}, workflow));
  assert.ok(!covered({...scripts, 'posttest:privacy': 'npm run build:future'}, workflow));
  assert.ok(!covered(scripts, workflow.replace('      - name: Deploy', '      - name: Additional writer\n        uses: example/build@v1\n\n      - name: Deploy')));
});
