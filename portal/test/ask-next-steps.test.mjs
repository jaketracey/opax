import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));
const context={URL,URLSearchParams,encodeURIComponent,decodeURIComponent};
runInNewContext(slice('function safeAnswerLink','\n/** Render links')+slice('function moneyNextSteps','\nfunction renderMoneyNextSteps'),context);
const answer=(head,first)=>`**Woodside Energy** has the largest disclosed total to Liberal: **$137,000**.\n\nFinancial years: 2020–21.\n\n| ${head} | Disclosed receipts | Records |\n| --- | ---: | ---: |\n| ${first} | $137,000 | 4 |\n| Santos | $90,000 | 2 |\n\nThese are **party receipts, not personal payments to politicians**.\n\nCoverage: Only receipts included in the map are ranked.\n\n[Explore these records](https://opax.com.au/money?industry=fossil_fuels&party=party%3ALiberal&from=2020&to=2020) · [Download the calculation data](https://opax.com.au/graph/money.json)`;
test('a money answer offers the receipts ledger under the same party and industry, and an ask about the leading donor',()=>{
 assert.deepEqual({...context.moneyNextSteps(answer('Donor','Woodside Energy'))},{map:'/money/receipts?party=party%3ALiberal&industry=fossil_fuels',donor:'Woodside Energy'});
 assert.deepEqual({...context.moneyNextSteps(answer('Donor → party','Woodside Energy → Liberal'))},{map:'/money/receipts?party=party%3ALiberal&industry=fossil_fuels',donor:'Woodside Energy'});
});
test('a party ranking names no donor, and an answer without the map link offers no map',()=>{
 assert.deepEqual({...context.moneyNextSteps(answer('Recipient party','Liberal'))},{map:'/money/receipts?party=party%3ALiberal&industry=fossil_fuels',donor:''});
 assert.deepEqual({...context.moneyNextSteps('No table, no link.')},{map:null,donor:''});
 assert.deepEqual({...context.moneyNextSteps('[Explore these records](https://evil.example/money?party=x)')},{map:null,donor:''});
});
