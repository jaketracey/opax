import test from 'node:test';
import assert from 'node:assert/strict';
import {runGold} from '../../scripts/agentic_ask_shadow.mjs';
test('the runner uses only the bearer ops route, and fixture scoring never fetches',async()=>{
 const questions=[{id:'R-fixture',question:'Who spoke most about gambling?',expected:{kind:'ranking',top:[{name:'Alex Example',count:9}],top_n:1}}];
 const payload={answered:true,answer:'Alex Example: 9 [1].'};let calls=0;
 const fetchImpl=async(url,init)=>{calls++;assert.equal(url.pathname,'/api/ops/ask-gold');assert.equal(url.hostname,'offline.invalid');assert.equal(init.headers.authorization,'Bearer fixture-secret');assert.equal(JSON.parse(init.body).period,'all');return Response.json(payload)};
 assert.equal((await runGold({questions,base:'https://offline.invalid',secret:'fixture-secret',fetchImpl})).passed,1);assert.equal(calls,1);
 assert.equal((await runGold({questions,fixture:[{id:'R-fixture',payload}],fetchImpl:()=>{throw Error('fixture must be offline')}})).passed,1);
});

test('legacy gold overrides never erase an explicitly requested decade',async()=>{
 const questions=[{id:'R-decade',question:'Who spoke most about health in the 2010s?',expected:{kind:'ranking',top:[{name:'Alex Example',count:9}],top_n:1}}];
 await runGold({questions,base:'https://offline.invalid',secret:'fixture-secret',fetchImpl:async(url,init)=>{assert.equal(JSON.parse(init.body).period,undefined);return Response.json({answered:true,answer:'Alex Example: 9 [1].'})}});
});
