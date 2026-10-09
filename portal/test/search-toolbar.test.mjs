import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const app = read('app.js');
const sync = app.slice(app.indexOf('function syncSearchReadBar()'), app.indexOf('\nfunction setSearchReadMode('));

test('brief availability stays in the results summary, outside the actions', () => {
  const html = read('index.html');
  const toolbar = html.slice(html.indexOf('id="results-bar"'), html.indexOf('id="search-sort-picker"'));
  assert.ok(toolbar.includes('id="search-brief-status"'));
  assert.ok(toolbar.indexOf('id="search-brief-status"') < toolbar.indexOf('class="results-actions"'));
});

test('shared segments preserve whole labels and their intrinsic width', () => {
  const rule = read('ui-controls.css').match(/\.ui-segmented > \.ui-button\s*\{([^}]+)\}/)[1];
  assert.match(rule, /white-space:\s*nowrap/);
  assert.match(rule, /overflow-wrap:\s*normal/);
  assert.match(rule, /word-break:\s*normal/);
  assert.match(rule, /min-width:\s*max-content/);
  assert.match(rule, /flex:\s*0 0 auto/);
});

function readBar({ results, briefs = {}, briefsLoading = false }) {
  const elements = Object.fromEntries(['search-readbar', 'search-read-passages', 'search-read-briefs', 'search-brief-status'].map(id => [id, {
    textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
  }]));
  const context = { $: id => elements[id], lastSearch: { results, briefs, briefsLoading }, searchReadMode: 'passages' };
  const render = runInNewContext(`${sync}; syncSearchReadBar`, context);
  return { elements, context, render };
}

test('switching modes keeps the summary identical, including partial or absent briefs', () => {
  for (const briefs of [{}, { a: 'A brief' }, { a: 'A brief', b: 'Another brief' }]) {
    const { elements, context, render } = readBar({ results: [{ resource: 'a' }, { resource: 'b' }], briefs });
    render();
    const summary = elements['search-brief-status'].textContent;
    assert.match(summary, new RegExp(`^${Object.keys(briefs).length} have briefs;`));
    for (const mode of ['briefs', 'passages', 'briefs']) {
      context.searchReadMode = mode;
      render();
      assert.equal(elements['search-brief-status'].textContent, summary);
      assert.equal(elements['search-read-briefs'].attributes['aria-pressed'], String(mode === 'briefs'));
      assert.equal(elements['search-read-passages'].attributes['aria-pressed'], String(mode === 'passages'));
    }
  }
});

test('loading availability is mode-independent and catalog results omit it', () => {
  const { elements, context, render } = readBar({ results: [{ resource: 'a' }], briefsLoading: true });
  render();
  const loading = elements['search-brief-status'].textContent;
  assert.match(loading, /Checking available briefs/);
  context.searchReadMode = 'briefs';
  render();
  assert.equal(elements['search-brief-status'].textContent, loading);
  context.lastSearch.results = [{ href: '/money/grants' }];
  render();
  assert.equal(elements['search-readbar'].hidden, true);
  assert.equal(elements['search-brief-status'].textContent, '');
});
