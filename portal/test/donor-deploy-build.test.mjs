import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const steps = ['search', 'social', 'grants-map', 'analytics', 'voice'];
const release = names => names.map(name => `npm run build:${name}`).join(' && ') +
  ' && node ../scripts/stamp_assets.mjs && node ../scripts/photo_identity.mjs --deploy && npm run build:privacy';
const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts;
const workflow = readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url), 'utf8');

function covered(s, yaml) {
  // An additional writer must be included here deliberately. Every output is
  // swept after the full pipeline, including stamp/photo and staging's graph.
  if (s['build:release'] !== release(steps)) return false;
  if (s['build:release:staging'] !== release(['search', 'social', 'grants-map', 'graph', 'analytics', 'voice'])) return false;
  if (s['test:privacy'] !== 'node --test test/donor-publication.test.mjs test/donor-deploy-build.test.mjs') return false;
  if (s.deploy !== 'node ../scripts/check_privacy_placeholders.mjs && npm run build:release && npm run deploy:built') return false;
  if (s['deploy:built'] !== 'node ../scripts/check_privacy_placeholders.mjs && npm run test:privacy && wrangler deploy') return false;
  if (s['deploy:staging'] !== 'node ../scripts/check_privacy_placeholders.mjs && npm run build:release:staging && npm run test:privacy && wrangler deploy --env staging') return false;
  if (Object.entries(s).some(([key, value]) => /^(?:pre|post)(?:deploy(?::built|:staging)?|test:privacy)$/.test(key) && value.trim())) return false;
  const beforeRestamp = yaml.split('      - name: Commit restamped assets back to main')[0];
  const names = [...beforeRestamp.matchAll(/^      - name: (.+)$/gm)].map(m => m[1]);
  if (JSON.stringify(names) !== JSON.stringify(['Check out main', 'Set up Node 24', 'Install', 'Build and sanitise all release assets', 'Test', 'Types', 'Deploy'])) return false;
  const runs = [...beforeRestamp.matchAll(/^        run: ([^\n]+)(?:\n((?:          [^\n]*\n)*))?/gm)]
    .map(m => m[1] === '|' ? m[2].trim().split('\n').map(x => x.trim()).join(' && ') : m[1]);
  return JSON.stringify(runs) === JSON.stringify(['npm ci', 'npm run build:release', 'npm test', 'npx wrangler types && npx tsc --noEmit', 'npm run deploy:built']);
}

test('deploy and CI sweep the same complete asset pipeline before uploading', () => {
  assert.ok(covered(scripts, workflow), 'deploy build/privacy coverage drifted');
});

test('a new deploy or workflow writer cannot escape the privacy coverage guard', () => {
  for (const key of ['build:release', 'build:release:staging', 'deploy', 'deploy:built', 'deploy:staging']) {
    assert.ok(!covered({...scripts, [key]: scripts[key] + ' && npm run build:future'}, workflow));
  }
  assert.ok(!covered(scripts, workflow.replace('run: npm run build:release', 'run: |\n          npm run build:release\n          npm run build:future')));
  assert.ok(!covered(scripts, workflow.replace('      - name: Deploy', '      - name: Additional writer\n        run: node ../scripts/future_builder.mjs\n\n      - name: Deploy')));
  assert.ok(!covered({...scripts, 'deploy:built': 'wrangler deploy'}, workflow));
  assert.ok(!covered({...scripts, 'posttest:privacy': 'npm run build:future'}, workflow));
  assert.ok(!covered(scripts, workflow.replace('      - name: Deploy', '      - name: Additional writer\n        uses: example/build@v1\n\n      - name: Deploy')));
});
