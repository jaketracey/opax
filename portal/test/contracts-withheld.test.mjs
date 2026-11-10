// Contracts left out of totals (cancelled at source, or a value held for review) reach Ask's contracts tool
// as notes in the source's terms, and placeholder years never print as "null" (contracts-grants-001/004,
// search-hubs-003/-008).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { grantValue } from '../../scripts/build_search_catalog.mjs';

const built = await build({ stdin: { contents: "export {tool} from './src/tools/contracts';", resolveDir: new URL('../', import.meta.url).pathname }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { tool } = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));

const agency = { id: 'a-568e5a85e529217cacf2', name: 'Australian Maritime Safety Authority', total: 1041486079.21, count: 93, first_year: 2016, last_year: 2026 };
const withheld = [{ id: 'CN3290712-A7', amount: 9626000000, agency: agency.name, status: 'value_under_review',
  caveat: 'AusTender notice CN3290712-A7 lists a contract value of $9,626,000,000.00 while the contract period ends 5 Nov 2024.' }];
const supplier = { id: 's-1', name: 'Withheld Only Pty Ltd', total: 0, count: 0, agency_count: 0, first_year: null, last_year: null, abn: null };
const assets = {
  '/agencies.json': { agencies: [agency] },
  [`/agencies/${agency.id}.json`]: { ...agency, suppliers: [{ id: 's-2', name: 'Counted Pty Ltd', total: 100, count: 1 }], withheld },
};
const env = { asset: async path => assets[path] ?? null };

test('an agency answer says which contracts are listed but not counted, with the reason', async () => {
  const out = await tool.handler(env, { agency: 'Australian Maritime Safety Authority' });
  const note = out.notes.find(n => /listed but not counted/.test(n));
  assert.ok(note, out.notes.join('\n'));
  assert.match(note, /^1 Australian Maritime Safety Authority contract is listed but not counted in these totals: CN3290712-A7 \(\$9,626,000,000/);
  assert.match(note, /\$9,626,000,000\.00 while the contract period ends 5 Nov 2024/);
  assert.equal(out.citations[0].value, agency.total);
});

test('an agency with nothing withheld gets no extra note', async () => {
  assets[`/agencies/${agency.id}.json`] = { ...agency, suppliers: [] };
  const out = await tool.handler(env, { agency: 'Australian Maritime Safety Authority' });
  assert.equal(out.notes.some(n => /listed but not counted/.test(n)), false);
});

test('a grant worth $0.00 at source reads as published, never $NaN', () => {
  assert.equal(grantValue(0), '$0 (as published)');
  assert.equal(grantValue(null), 'Value not recorded');
  assert.equal(grantValue(undefined), 'Value not recorded');
  assert.equal(grantValue('x'), 'Value not recorded');
  assert.equal(grantValue(1234.5), '$1,234.50');
});
