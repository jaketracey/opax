import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const code = app.slice(app.indexOf('let supplierPage ='), app.indexOf('function rawFragment()'))
  .replace('import("/suppliers.js?v=search-all-2")', 'loadModule()');

function harness(loadModule) {
  const body = { innerHTML: '', classList: { remove() {} } };
  const context = { loadModule, currentSubjectKey: null, activeDirectory: null,
    $: () => body, destroySubjectMap() {}, document: {}, replaceRoute() {}, setCrumbs() {}, subjectMentions() {} };
  runInNewContext(code, context);
  return { context, body };
}

test('leaving a supplier route during module load cannot mount over the next page', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  let mounted = false;
  const { context, body } = harness(() => pending);
  const opening = context.openSupplierPage('Example', {}, false);
  context.destroySupplierPage();
  body.innerHTML = 'The next page';
  resolve({ mountSupplierProfile() { mounted = true; } });
  await opening;
  assert.equal(mounted, false);
  assert.equal(body.innerHTML, 'The next page');
});

test('departure destroys the mounted supplier view and invalidates its title callback', async () => {
  let helpers, destroyed = 0;
  const { context } = harness(async () => ({ mountSupplierDirectory(root, options) {
    helpers = options;
    return { destroy() { destroyed++; } };
  } }));
  await context.openSupplierPage(null, {}, false);
  context.destroySupplierPage();
  context.document.title = 'Next page';
  helpers.onTitle('Late supplier title');
  assert.equal(destroyed, 1);
  assert.equal(context.document.title, 'Next page');
});
