import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {budgetDatabase} from './fixtures/research-budget.mjs';
const built=await build({entryPoints:[new URL('../src/research-budget.ts',import.meta.url).pathname],bundle:true,write:false,platform:'browser',format:'esm'});
const {researchDailyBudget}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('atomic daily reservations cannot overbook, including the first turn of a new day',async t=>{
 const f=budgetDatabase();t.after(f.close);let now=Date.UTC(2026,9,14),budget=researchDailyBudget(f.db,'0.10',()=>now);
 const turns=await Promise.all(Array.from({length:20},()=>budget.reserve(0.03)));
 assert.equal(turns.filter(Boolean).length,3);assert.equal(f.sqlite.prepare('SELECT charged_microusd FROM research_daily_spend').get().charged_microusd,90000);
 assert.equal(await budget.reserve(0.11),null);
 now+=86400000;assert.equal(await budget.reserve(0.11),null);assert.ok(await budget.reserve(0.1));
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM research_daily_spend').get().n,2);
});
test('settlement refunds once; unknown or failed settlement keeps the reserved charge',async t=>{
 const f=budgetDatabase();t.after(f.close);const budget=researchDailyBudget(f.db,'1'),charge=()=>f.sqlite.prepare('SELECT charged_microusd FROM research_daily_spend').get().charged_microusd;
 const a=await budget.reserve(0.1);await a.settle(0.0123451);assert.equal(charge(),12346);await a.settle(0);assert.equal(charge(),12346);
 const b=await budget.reserve(0.1);await b.settle();assert.equal(charge(),112346);
 const c=await budget.reserve(0.1);await c.settle(0);assert.equal(charge(),112346);
});
test('invalid or disabled caps fail closed, default is US$5, and missing table refuses admission',async t=>{
 const f=budgetDatabase();t.after(f.close);
 for(const cap of ['0','-1','not-a-number','Infinity'])assert.equal(await researchDailyBudget(f.db,cap).reserve(0.001),null);
 assert.ok(await researchDailyBudget(f.db).reserve(5));assert.equal(await researchDailyBudget(f.db).reserve(0.000001),null);
 await assert.rejects(researchDailyBudget(f.db).reserve(NaN));
 f.sqlite.exec('DROP TABLE research_daily_spend');await assert.rejects(researchDailyBudget(f.db).reserve(0.01));
});
test('shadow availability checks the same UTC ledger and fails closed when unavailable',async t=>{
 const f=budgetDatabase();t.after(f.close);const budget=researchDailyBudget(f.db,'1');assert.equal(await budget.available(0.96),true);const lease=await budget.reserve(0.96);assert.equal(await budget.available(0.96),false);await lease.settle(0.01);assert.equal(await budget.available(0.96),true);assert.equal(await researchDailyBudget(f.db,'0').available(0.01),false);f.sqlite.exec('DROP TABLE research_daily_spend');await assert.rejects(budget.available(0.01));
});
