// The party receipts table names industries in words; a link from before that
// change carries the raw code. Both filter the same rows, and the label helper
// is the one Explain uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {industryName, partyMoneyTableConfig, partyMoneyTableQuery, registerTableHTML} from '../public/register-tables.js';
import {industryName as explainIndustryName} from '../public/money-explain.js';

const rows = [
  {label:'Example Bank Ltd', href:null, industry:'finance', total:400, count:2, firstYear:2020, lastYear:2021},
  {label:'Example Mining Pty Ltd', href:null, industry:'mining_&_energy', total:300, count:1, firstYear:2020, lastYear:2020},
  {label:'A private giver', href:null, industry:'individual', total:200, count:1, firstYear:2021, lastYear:2021},
  {label:'Untagged Holdings', href:null, industry:'', total:100, count:1, firstYear:2022, lastYear:2022},
];
const shown = url => {
  const config = partyMoneyTableConfig(rows, undefined, undefined, undefined, {party:'Fixture Party', jurisdiction:'federal'});
  const doc = new JSDOM(registerTableHTML(config, undefined, new URL(url))).window.document;
  return [...doc.querySelectorAll('tbody [data-phone-title] .dt-value')].map(cell => cell.textContent);
};

test('an old raw-code industry link and a label link filter the same rows', () => {
  const raw = shown('https://opax.test/subject/party/fixture?partyMoney.f.industry=' + encodeURIComponent('["finance"]'));
  const label = shown('https://opax.test/subject/party/fixture?partyMoney.f.industry=' + encodeURIComponent('["Finance"]'));
  assert.deepEqual(raw, ['Example Bank Ltd'], 'the raw code applies the filter it shows');
  assert.deepEqual(label, raw);
  assert.deepEqual(shown('https://opax.test/subject/party/fixture?partyMoney.f.industry=' + encodeURIComponent('["mining_&_energy"]')), ['Example Mining Pty Ltd']);
  assert.equal(shown('https://opax.test/subject/party/fixture').length, 4);
  assert.deepEqual(partyMoneyTableQuery({filters:{industry:['finance','Finance','Not supplied']}}).filters.industry, ['Finance','Industry not recorded']);
});

test('one industry label for the party table and Explain', () => {
  // Explain imports the stamped module, a separate instance: compare what it says.
  for (const key of ['finance', 'mining_&_energy', 'individual', 'individuals', '', null, 'Not supplied', 'Finance'])
    assert.equal(explainIndustryName(key), industryName(key), `Explain and the table name ${JSON.stringify(key)} alike`);
  assert.equal(industryName('finance'), 'Finance');
  assert.equal(industryName('mining_&_energy'), 'Mining & energy');
  assert.equal(industryName('individual'), 'Individual', 'the pipeline tags a private person "individual"');
  assert.equal(industryName(''), 'Industry not recorded');
  assert.equal(industryName(null), 'Industry not recorded');
  assert.equal(industryName('Finance'), 'Finance', 'a label maps to itself');
  const config = partyMoneyTableConfig(rows);
  assert.deepEqual(config.rows.map(row => row.industry), ['Finance', 'Mining & energy', 'Individual', 'Industry not recorded']);
});
