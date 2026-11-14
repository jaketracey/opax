import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {chamberLabel, divisionOutcome} from '../public/party-page.js';
import {partyOnBill} from '../public/money-explain.js';

// A House tie with no named result is decided by the Speaker's casting vote, so it
// is not guessed ("Not agreed"); a Senate tie stays "Not agreed". Fixtures only.
const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const statements = parsed.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'docMeta');
const code = ts.transpileModule(statements.map(n => n.getText(parsed)).join('\n'), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;

async function metaFor(chamber) {
  const context = {
    SITE_ORIGIN: 'https://opax.com.au', publisher: {}, chamberLabel, divisionOutcome,
    DIVISION_SLUG_RE: /^division-[a-z0-9-]+$/, isPublicSlug: () => true,
    clip: (s) => s, longDate: (s) => s, divisionTrail: () => null,
    apiResource: async () => Response.json({
      title: 'A division, 1 January 2026: a motion', speaker: null, summary: null,
      labels: {kind: 'division', result: '', chamber},
      metadata: {date: '2026-01-01', ayes_count: 70, noes_count: 70},
    }),
    setTimeout, Response, Promise,
  };
  runInNewContext(code, context);
  const url = new URL('https://opax.com.au/doc/hansard-fixture');
  return context.docMeta('hansard-fixture', url, new Request(url), {}, {});
}

test('doc page: a House tie is not worded Not agreed, a Senate tie is', async () => {
  const house = await metaFor('representatives');
  assert.doesNotMatch(house.description, /Not agreed|Agreed/);
  assert.match(house.description, /70 votes to 70/);
  const senate = await metaFor('senate');
  assert.match(senate.description, /Not agreed, 70 votes to 70/);
});

test('money explainer: the deciding division carries its house into the outcome wording', () => {
  const bill = house => ({key: 'b', title: 'T', divisions: [{date: '2026-01-01', stage: 'Third reading', house, ayes: 70, noes: 70,
    party_splits: {Labor: {ayes: 5, noes: 0}}, url: ''}]});
  assert.equal(divisionOutcome('', partyOnBill(bill('representatives'), 'Labor', 2025, 2026).deciding.counts), '');
  assert.equal(divisionOutcome('', partyOnBill(bill('senate'), 'Labor', 2025, 2026).deciding.counts), 'Not agreed');
});
