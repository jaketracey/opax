// Bill divisions fold only repeated records of one division (chamber, day and division number),
// never two divisions that share a day, stage and tally.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {divisionIdentity, divisionRows} from '../public/vote-tables.js';
import {renderBillAnswer} from '../src/seo-content.ts';

test('two divisions on one day with identical tallies are both shown and both counted', () => {
  // federal-senate-10701 and -10702 on the Interactive Gambling Amendment (Gambling Reform) Bill 2026:
  // different questions, Senate divisions 6 and 7 of 19 Aug 2026, both 11 ayes to 24 noes.
  const pair = [
    {key:'federal-senate-10701', date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome:'negative', ayes:11, noes:24,
      url:'https://theyvoteforyou.org.au/divisions/senate/2026-08-19/6', question:'Sheet 4005 amendment'},
    {key:'federal-senate-10702', date:'2026-08-19', house:'senate', stage:'Limitation of debate', outcome:'negative', ayes:11, noes:24,
      url:'https://theyvoteforyou.org.au/divisions/senate/2026-08-19/7', question:'Second reading amendment'},
  ];
  assert.notEqual(divisionIdentity(pair[0]), divisionIdentity(pair[1]));
  const rows = divisionRows(pair, true);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter(r => r.outcome === 'Not agreed').length, 2);
  // One division recorded twice (same chamber, day and number) is one row.
  assert.equal(divisionRows([pair[0], {...pair[0], key:'repeat-record'}], true).length, 1);
  // No identity at all: kept, never merged on tally.
  assert.equal(divisionRows([{date:'2026-08-19', stage:'Second reading', ayes:1, noes:2}, {date:'2026-08-19', stage:'Second reading', ayes:1, noes:2}], true).length, 2);
  // The browser's own bill dedupe uses the same identity, and counts only true repeats as collapsed.
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('function billDedupeDivisions('), app.indexOf('/* The record writes its questions as'));
  const {billDedupeDivisions} = runInNewContext(code + ';({billDedupeDivisions})', {voteTables:{divisionIdentity}, billQuestionParts:() => ({head:'x'})});
  const deduped = billDedupeDivisions([...pair, {...pair[1], key:'repeat-of-7'}], {});
  assert.equal(deduped.divisions.length, 2);
  assert.equal(deduped.collapsed, 1);
  assert.match(app, /repeated record\$\{collapsed === 1 \? "" : "s"\}\n\s+of the same division/);
  // And the server-rendered bill page lists both.
  const html = renderBillAnswer({key:'au-federal-r7520', title:'Fixture Bill 2026', divisions:pair, sources:[]}, [], new Map(), [], {}).html;
  const body = (html.match(/<tbody[\s\S]*?<\/tbody>/) || [''])[0];
  assert.equal((body.match(/<tr\b/g) || []).length, 2);
});
