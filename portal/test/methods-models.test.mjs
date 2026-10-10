import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {configuredModels, methodsModels, renderMethodsModels, buildMethods} from '../../scripts/build_methods.mjs';

const pub = new URL('../public/', import.meta.url);
const html = readFileSync(new URL('index.html', pub), 'utf8');
const config = configuredModels();
const section = value => value.match(/<section id="panel-methods"[\s\S]*?<\/section>/)?.[0];
const value = (page, kind) => page.match(new RegExp(`<span id="methods-${kind}">([\\s\\S]*?)</span>`))?.[1];

test('methods names match the configured Worker pins and corpus model identity', () => {
  assert.doesNotThrow(() => buildMethods({check: true}));
  for (const [key, pin] of Object.entries(config.vars).filter(([key]) => key.endsWith('_MODEL'))) {
    assert.equal(config.models.generation, pin, key);
  }
  assert.equal(value(html, 'generation'), `<code>${config.models.generation_details.name}</code> via ${config.models.generation_details.provider} preset <code>${config.models.generation_details.preset}</code> (<code>${config.vars.ASK_MODEL}</code>)`);
  assert.equal(value(html, 'embeddings'), `<code>${config.models.embeddings}</code>`);
  assert.match(section(html), /13 March 1993/);
  assert.match(section(html), /Model identity may change between corpus versions and\s+is recorded in the manifest\./);
  // The server-rendered page hydrates from this generated copy of the shell.
  const spa = readFileSync(new URL('spa-shell.js', pub), 'utf8');
  const shell = JSON.parse(spa.match(/main\.innerHTML=(.*?);if\(answer\)/s)[1]);
  assert.equal(section(shell), section(html));
});

test('methods rejects a changed generation pin in any Worker pipeline', () => {
  for (const key of Object.keys(config.vars).filter(key => key.endsWith('_MODEL'))) {
    assert.throws(() => methodsModels({...config, vars: {...config.vars, [key]: 'fixture-model'}}), /manifest generation disagrees/);
  }
  assert.throws(() => methodsModels({...config, models: {...config.models, generation_details: undefined}}), /slot model identity/);
});

test('methods regeneration replaces stale names and takes new identities from the manifest', () => {
  const stale = html.replace(value(html, 'generation'), '<code>fixture-stale-model</code>');
  assert.notEqual(stale, renderMethodsModels(stale, config));
  assert.equal(renderMethodsModels(stale, config), html);
  const changed = {...config, models: {...config.models, generation_details: {name: 'Fixture Model', provider: 'Fixture Provider', preset: '@preset/fixture', model_id: 'fixture/model'}}};
  const updated = renderMethodsModels(html, changed);
  assert.equal(value(updated, 'generation'), '<code>Fixture Model</code> via Fixture Provider preset <code>@preset/fixture</code> (<code>openai-compatible</code>)');
  // Only the two model spans may change; all other Methods copy is preserved.
  const withoutModels = page => page.replace(/(<span id="methods-(?:generation|embeddings)">)[\s\S]*?<\/span>/g, '$1</span>');
  assert.equal(withoutModels(updated), withoutModels(html));
});

test('methods uses an unnamed embedding fallback and escapes manifest text', () => {
  const changed = {...config, models: {...config.models, embeddings: undefined, generation_details: {...config.models.generation_details, name: '<fixture>'}}};
  const models = methodsModels(changed);
  assert.equal(models.embeddings, "the knowledge box's embedding model");
  assert.match(models.generation, /<code>&lt;fixture&gt;<\/code>/);
});

test('methods checks run during search builds and stamp gates', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const stamp = readFileSync(new URL('../../scripts/stamp_assets.mjs', import.meta.url), 'utf8');
  assert.match(pkg.scripts['build:search'], /npm run build:methods/);
  assert.match(pkg.scripts.check, /stamp_assets\.mjs --check/);
  assert.match(pkg.scripts.deploy, /stamp_assets\.mjs/);
  assert.match(stamp, /buildMethods\(\{ check \}\)\s+buildSpaShell\(\{ check \}\)/);
});
