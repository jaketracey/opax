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
  if (JSON.stringify(names) !== JSON.stringify(['Check out main', 'Set up Node 24', 'Install', 'Capture gate identity', 'Restore exact full gate receipt', 'Configure desktop registry connection', 'Reuse or obtain one authoritative full pass', 'Save exact full gate receipt', 'Build and sanitise all release assets', 'Types', 'Deploy'])) return false;
  const blocks = [...beforeRestamp.matchAll(/^      - name: ([^\n]+)\n([\s\S]*?)(?=^      - name: |$(?![\s\S]))/gm)];
  const run = name => {
    const body = blocks.find(m => m[1] === name)?.[2] || '';
    const match = /^        run: ([^\n]+)(?:\n((?:          [^\n]*\n)*))?/m.exec(body);
    return match?.[1] === '|' ? match[2].trim().split('\n').map(x => x.trim()).join(' && ') : match?.[1];
  };
  const infrastructureRuns = {
    'Capture gate identity': [
      'mkdir -p .ops/gate-cache',
      'node .ops/tools/gate-cache.mjs identity --out .ops/gate-cache/ci-identity.json',
      `node --input-type=module -e 'import {readFileSync,appendFileSync} from "node:fs"; const id=JSON.parse(readFileSync(".ops/gate-cache/ci-identity.json")); appendFileSync(process.env.GITHUB_OUTPUT,"key="+id.key+"\\n");'`,
    ],
    'Configure desktop registry connection': [
      'test -n "$GATE_SSH_KEY" && test -n "$GATE_KNOWN_HOSTS"',
      'install -d -m 700 "$HOME/.ssh"',
      `printf '%s\\n' "$GATE_SSH_KEY" > "$HOME/.ssh/id_ed25519"`,
      'chmod 600 "$HOME/.ssh/id_ed25519"',
      `printf '%s\\n' "$GATE_KNOWN_HOSTS" > "$HOME/.ssh/known_hosts"`,
    ],
  };
  if (Object.entries(infrastructureRuns).some(([name, lines]) => run(name) !== lines.join(' && '))) return false;
  if (!yaml.includes('node-version: 24.21.0')) return false;
  // Gate writers run in an isolated snapshot; the deploy runner still builds
  // and sweeps every local release output before its final mandatory guard.
  return run('Install') === 'npm ci' &&
    run('Reuse or obtain one authoritative full pass') === 'bash .ops/tools/ci-gates.sh' &&
    run('Build and sanitise all release assets') === 'npm run build:release' &&
    run('Types') === 'npx wrangler types && npx tsc --noEmit' &&
    run('Deploy') === 'npm run deploy:built';
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
  assert.ok(!covered(scripts, workflow.replace('run: bash .ops/tools/ci-gates.sh', 'run: echo CACHED_PASS')));
  assert.ok(!covered(scripts, workflow.replace('node-version: 24.21.0', 'node-version: 26')));
  assert.ok(!covered(scripts, workflow.replace('mkdir -p .ops/gate-cache', 'mkdir -p .ops/gate-cache\n          npm run build:future')));
  assert.ok(!covered(scripts, workflow.replace('      - name: Deploy', '      - name: Additional writer\n        uses: example/build@v1\n\n      - name: Deploy')));
});
