// A count page never sits on its loader forever (14 Oct: the bare catalog
// totals stopped answering after the corpus passed ~1M resources and the
// Parties directory held "Opening the directory..." indefinitely). Aggregate
// reads go through aggregateApi(), which gives up after AGGREGATE_WAIT_MS; the
// page then renders without the counts and says they are updating.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true);
const fn = (name) => parsed.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(parsed);
const constant = (name) => parsed.statements.find((n) => ts.isVariableStatement(n)
  && n.declarationList.declarations.some((d) => d.name.getText(parsed) === name)).getText(parsed);

/** A window whose fetch never answers (it honours abort), running the named app.js functions. */
function page(names, extra = '') {
  const dom = new JSDOM(`<!doctype html><html><body><div id="subject-body"></div></body></html>`,
    { url: 'https://opax.com.au/subject/topic', runScripts: 'outside-only' });
  const { window } = dom;
  const requested = [];
  window.fetch = (path, init = {}) => new Promise((_resolve, reject) => {
    requested.push(path);
    init.signal?.addEventListener('abort', () => reject(new window.DOMException('aborted', 'AbortError')), { once: true });
  });
  window.eval(`(() => {
    const AGGREGATE_WAIT_MS = 30;
    const $ = (id) => document.getElementById(id);
    let currentSubjectKey = null;
    const loaders = [];
    const destroySubjectMap = () => {};
    const showPageLoader = (id, label) => { loaders.push(['show', id, label]); };
    const clearPageLoader = (id) => { loaders.push(['clear', id]); };
    const countUp = () => {};
    const entityHrefAttr = (href) => 'href="' + href + '"';
    const subjectHash = (kind, label) => '/subject/' + kind + '/' + encodeURIComponent(label);
    ${constant('TOPICS')}
    ${['api', 'aggregateApi', 'esc', ...names].map(fn).join('\n')}
    ${extra}
    window.__app = { aggregateApi, loaders, ${names.join(', ')} };
  })()`);
  return { window, requested, app: window.__app };
}

test('aggregateApi rejects a stalled read after its wait, marked timedOut, and honours an outside abort', async () => {
  const { app, window } = page([]);
  const started = Date.now();
  const err = await app.aggregateApi('/api/topics').catch((e) => e);
  assert.equal(err.timedOut, true);
  assert.ok(Date.now() - started < 1000, 'gave up on its own wait');
  const outside = new window.AbortController();
  const pending = app.aggregateApi('/api/topics', { signal: outside.signal, wait: 60000 }).catch((e) => e);
  outside.abort();
  const aborted = await pending;
  assert.notEqual(aborted.timedOut, true, 'an outside abort is not a timeout');
});

test('the topics index renders every topic without counts when /api/topics stalls', async () => {
  const { app, window, requested } = page(['openTopicsIndex', 'topicIndexDescription']);
  await app.openTopicsIndex(false);
  const body = window.document.getElementById('subject-body');
  assert.ok(requested.includes('/api/topics'));
  assert.deepEqual(JSON.parse(JSON.stringify(app.loaders.map(([step]) => step))), ['show', 'clear'], 'the loader is cleared');
  const rows = body.querySelectorAll('.topic-index-list li');
  assert.equal(rows.length, 21);
  assert.match(body.querySelector('.topic-index-note').textContent, /Counts are updating/);
  assert.equal(body.querySelector('.topic-index-count b'), null, 'no count is shown');
  assert.equal(body.querySelector('.topic-index-sort'), null, 'no "Most discussed" sort without counts');
  assert.equal(body.querySelector('.topic-index-list').dataset.counts, 'pending', 'the 390px layout drops the empty count rows');
  assert.ok(rows[0].querySelector('a').getAttribute('href').startsWith('/subject/topic/'), 'each topic still opens its page');
});

test('the parties directory builds without speech figures when /api/parties stalls', async () => {
  const { app } = page(['buildPartiesDirectory', 'yearSpan', 'anyPartyDotHTML', 'fmtMoney'], `
    const loadMoneyFile = async (jur) => jur === 'federal' ? { nodes: [{ kind: 'party', label: 'Example Party', total: 1000, count: 2, firstYear: 2020, lastYear: 2024 }], edges: [] } : null;
    const loadParliamentarians = async () => ({ people: [{ name: 'Example Member', party: 'Example Party' }] });
    const MONEY_JURISDICTIONS = { federal: { label: 'Federal' } };
    const STATE_NOT_SUMMED = '', AEC_NOTE = '';
    const partyDotHTML = () => '', partyColour = () => '', partyClass = () => '';
    const byNumDesc = (get) => (a, b) => (get(b) || 0) - (get(a) || 0);
    const moneyFor = (row) => row._total;
    const byName = (a, b) => a._sortName.localeCompare(b._sortName);`);
  const spec = await app.buildPartiesDirectory();
  assert.equal(spec.lede, 'Speech counts are updating.');
  assert.ok(!spec.sorts.some(([key]) => key === 'speeches'), 'no speech sort');
  assert.ok(!spec.filters.find((f) => f.key === 'show').options.some(([key]) => key === 'speeches'));
  const row = spec.row(spec.items[0]);
  assert.doesNotMatch(row, /speech/, 'no "0 speeches" figure');
  assert.match(row, /in the directory/);
});

test('the topic page and every module that waits on an aggregate bound the wait', () => {
  const openTopicPage = fn('openTopicPage');
  assert.match(openTopicPage, /aggregateApi\(`\/api\/topic\//);
  assert.match(openTopicPage, /aggregateApi\("\/api\/tide"\)/);
  assert.match(openTopicPage, /Counts are updating\./);
  assert.match(fn('loadLiveStats'), /aggregateApi\(/);
  // No count page reads an aggregate through the unbounded api().
  assert.ok(!/\bapi\(\s*["`]\/api\/(topics|parties|stats|tide|matrix|topic\/)/.test(app), 'no aggregate read through the unbounded api()');
  for (const file of ['tide.js', 'matrix.js', 'wordsdollars.js']) {
    const source = readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
    assert.ok(/setTimeout\(\(\) => \{ timedOut = true; \w+\.abort\(\) \}, 12000\)/.test(source), `${file} bounds its fetch`);
    assert.ok(/timedOut\s*\?\s*'[^']*updating/.test(source), `${file} says the counts are updating`);
  }
  assert.match(readFileSync(new URL('../public/timemachine.js', import.meta.url), 'utf8'), /fetchJSONWithin\('\/api\/stats'/);
});
