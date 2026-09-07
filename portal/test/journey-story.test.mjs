import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {buildMoneyJourneys} from '../public/money-journeys-data.js';
const source=readFileSync(new URL('../src/journey-story.ts',import.meta.url),'utf8').replace(/^import .*$/m,'').replace(/export /g,'');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {journeyStoryContext,parseJourneyStory}=runInNewContext(`${code}; ({journeyStoryContext,parseJourneyStory})`,{buildMoneyJourneys,Intl});
const graph=JSON.parse(readFileSync(new URL('../public/graph/money.json',import.meta.url),'utf8'));
const context=()=>journeyStoryContext(graph,'multiple-parties','donor:allianz australia');
const answer=c=>({steps:c.steps.map(s=>({title:`A closer look at ${s.focus}`,body:`The disclosed link from ${s.facts[0].from} to ${s.facts[0].to} records ${s.facts[0].amount}.`,evidence:[s.facts[0].id]}))});
test('story facts are server-derived and keep shares consistent across close-up scenes',()=>{
 const c=context();assert.ok(c);
 assert.equal(c.steps[0].facts[0].amount,c.steps[1].facts[0].amount);
 assert.equal(c.steps[0].facts[0].shareOfThisSourcesShownReceipts,c.steps[1].facts[0].shareOfThisSourcesShownReceipts);
 assert.equal(c.steps[1].facts[0].shareOfThisSourcesShownReceipts,'50.4%');
 assert.equal(journeyStoryContext(graph,'multiple-parties','invented'),null);
});
test('narration accepts exact scene evidence, rejects invented figures and cross-scene references',()=>{
 const c=context();const a=answer(c);assert.equal(parseJourneyStory(JSON.stringify(a),c).length,c.steps.length);
 a.steps[0].body+=' It amounted to $987,654,321.';assert.equal(parseJourneyStory(JSON.stringify(a),c),null);
 const b=answer(c);b.steps[0].evidence=['s1e0'];assert.equal(parseJourneyStory(JSON.stringify(b),c),null);
});
test('malformed output, markup, donations claims and missing steps use the fallback',()=>{
 const c=context();assert.equal(parseJourneyStory('bad JSON',c),null);
 for(const body of ['<img src=x> This is invented markup.','These donations show money in this record.']) {
  const a=answer(c);a.steps[0].body=body;assert.equal(parseJourneyStory(JSON.stringify(a),c),null);
 }
 const a=answer(c);a.steps.pop();assert.equal(parseJourneyStory(JSON.stringify(a),c),null);
});
test('time narratives use the exact dated window, not lifetime totals',()=>{
 const c=journeyStoryContext(graph,'over-time','donor:austal');assert.ok(c);
 assert.match(c.steps[0].period,/2020–2022/);
 assert.notEqual(c.steps[0].facts[0].amount,c.steps[1].facts[0].amount);
});
