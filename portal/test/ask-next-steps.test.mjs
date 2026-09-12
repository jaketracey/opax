import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const slice=(from,to)=>app.slice(app.indexOf(from),app.indexOf(to,app.indexOf(from)));
const element=tag=>({tag,children:[],appendChild(node){this.children.push(node)},setAttribute(key,value){this[key]=value}});
const context={URL,URLSearchParams,encodeURIComponent,decodeURIComponent,document:{createElement:element},askHash:q=>'/ask?q='+encodeURIComponent(q)};
runInNewContext(slice('function safeAnswerLink','\n/** Render links')+slice('function moneyNextSteps','\nfunction setFrontPageHidden'),context);
const answer=(head,first)=>`**Woodside Energy** has the largest disclosed total to Liberal: **$137,000**.\n\nFinancial years: 2020–21.\n\n| ${head} | Disclosed receipts | Records |\n| --- | ---: | ---: |\n| ${first} | $137,000 | 4 |\n| Santos | $90,000 | 2 |\n\nThese are **party receipts, not personal payments to politicians**.\n\nCoverage: Only receipts included in the map are ranked.\n\n[Explore these records](https://opax.com.au/money?industry=fossil_fuels&party=party%3ALiberal&from=2020&to=2020) · [Download the calculation data](https://opax.com.au/graph/money.json)`;
const expectedMap='/money?industry=fossil_fuels&party=party%3ALiberal&from=2020&to=2020';
test('a funding next step preserves the map selection and financial years',()=>{
 assert.deepEqual({...context.moneyNextSteps(answer('Donor','Woodside Energy'))},{map:expectedMap,receipts:expectedMap.replace('/money?', '/money/receipts?'),donor:'Woodside Energy'});
 assert.deepEqual({...context.moneyNextSteps(answer('Donor → party','Woodside Energy → Liberal'))},{map:expectedMap,receipts:expectedMap.replace('/money?', '/money/receipts?'),donor:'Woodside Energy'});
});
test('a party ranking names no donor, and an answer without the map link offers no map',()=>{
 assert.deepEqual({...context.moneyNextSteps(answer('Recipient party','Liberal'))},{map:expectedMap,receipts:expectedMap.replace('/money?', '/money/receipts?'),donor:''});
 assert.deepEqual({...context.moneyNextSteps('No table, no link.')},{map:null,receipts:null,donor:''});
 assert.deepEqual({...context.moneyNextSteps('[Explore these records](https://evil.example/money?party=x)')},{map:null,receipts:null,donor:''});
});
test('Queensland, exact donor, recipient and year selections survive the next step',()=>{
 const source='https://opax.com.au/money?jur=qld&type=receipts&focus=donor%3Atabcorp&party=party%3ALabor&from=2020&to=2020';
 const {map}=context.moneyNextSteps(`[Explore these records](${source})`);
 const target=new URL(map,'https://opax.com.au');
 assert.equal(target.pathname,'/money');
 assert.deepEqual([...target.searchParams],[...new URL(source).searchParams]);
 assert.equal(target.searchParams.get('focus'),'donor:tabcorp');
});
test('validated map links stay on the current preview origin with their full scope',()=>{
 const source='/money?jur=vic&type=receipts&industry=gambling&focus=donor%3Acrown%20castle%20australia&from=2021&to=2022';
 const {map}=context.moneyNextSteps(`[Explore these records](${source})`);
 for(const origin of ['http://127.0.0.1:8834','http://localhost:8793','https://opax.com.au']){
  const target=new URL(map,origin);
  assert.equal(target.origin,origin);
  assert.equal(target.pathname,'/money');
  assert.deepEqual([...target.searchParams],[...new URL(source,origin).searchParams]);
 }
});
test('a map action cannot be redirected to a different route, origin or executable URL',()=>{
 for(const source of ['https://evil.example/money?party=x','//evil.example/money','https://opax.com.au@evil.example/money','javascript:alert%281%29','/money/receipts?party=party%3ALabor','/ask?q=money','http://localhost:8834/money']){
  assert.equal(context.moneyNextSteps(`[Explore these records](${source})`).map,null,source);
 }
});
test('the rendered funding action names its map destination and retains the existing speech follow-up',()=>{
 const container=element('div');
 context.renderMoneyNextSteps(container,answer('Donor','Woodside Energy'));
 const nav=container.children[0];
 assert.equal(nav['aria-label'],'Next steps');
 const [receipts,map,followup]=nav.children;
 assert.equal(receipts.href,expectedMap.replace('/money?', '/money/receipts?'));
 assert.equal(receipts.textContent,'See matching receipts');
 assert.equal(map.href,expectedMap);
 assert.equal(map.textContent,'Explore this funding on the money map');
 assert.equal(new URL(followup.href,'https://opax.com.au').searchParams.get('q'),'What has parliament said about Woodside Energy?');
});

test('the receipt list keeps every exact source filter and stays on the current origin',()=>{
 const source='https://opax.com.au/money?jur=qld&type=receipts&focus=donor%3Atabcorp&party=party%3ALabor&from=2020&to=2020';
 const {receipts}=context.moneyNextSteps(`[Explore these records](${source})`);
 for(const origin of ['http://127.0.0.1:8860','https://opax.com.au']){
  const target=new URL(receipts,origin);
  assert.equal(target.origin,origin);
  assert.equal(target.pathname,'/money/receipts');
  assert.deepEqual([...target.searchParams],[...new URL(source).searchParams]);
 }
});
test('graph-only selections never produce a broader receipt-list link',()=>{
 for(const suffix of ['type=grants','type=contracts','cpi=1','journey=industry','unknown=1','type=receipts#something']){
  const {receipts}=context.moneyNextSteps(`[Explore these records](/money?${suffix})`);
  assert.equal(receipts,null,suffix);
 }
});
