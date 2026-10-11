// Offline review differential: node scripts/differential_non_historic.mjs ENRICH_DIR OUTPUT_JSON
// Compares original behavior; excludes only new historic metadata and tick counters.
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
const dir=process.argv[2];
const load=async p=>import(pathToFileURL(`${dir}/${p}`));
const {FakeAi,FakeKb,makeDeps,speechText,GOOD_SUMMARY,rows}=await load('test/helpers.ts');
const {runTick}=await load('src/tick.ts');
const {enqueue,finishRows,hasBackfill}=await load('src/db.ts');
const sourceLabels=['vic_hansard','hansard','aph_hansard','nsw_hansard','qld_hansard','sa_hansard','wa_hansard','tas_hansard','act_hansard','nt_hansard','media_release','arbitrary-source',''];
const scenarios=['success','retry','quarantine','quota','no-text','short','existing','budget','flush','flush-backpressure','flush-full-read-failure'];
const result={};
for (const source of sourceLabels) for (const scenario of scenarios) {
 const kb=new FakeKb(); kb.add('r1',{title:'A withheld speaker — topic — 2026-09-24',texts:{body:speechText()},classifications:[{labelset:'kind',label:source==='media_release'?'press_release':'speech'},{labelset:'source',label:source}]});
 const good=JSON.stringify({summary:GOOD_SUMMARY,topics:['housing']});
 const ai=new FakeAi(({n})=> {
  if(scenario==='retry' && n<2) return 'not JSON';
  if(scenario==='quarantine') return 'not JSON';
  if(scenario==='quota') return new Error('quota 4006');
  return good;
 });
 const {deps,d1,raw}=makeDeps({kb,ai,env:{HISTORIC_HOLD:'true',WRITE_MODE:'live',DAILY_NEURON_BUDGET:'100',STEADY_NEURON_BUDGET:'100'}});
 const tasks=source==='media_release'?['release_summary']:['speech_summary','speech_topics'];
 await enqueue(d1,tasks.map(task=>({rid:'r1',task,priority:0})),1);
 if(scenario==='no-text') kb.resources.get('r1').texts.body='Moved.';
 if(scenario==='short') kb.resources.get('r1').texts.body='Requested better regional housing and health services.';
 if(scenario==='existing') { kb.resources.get('r1').texts['da-summary-t-body']=GOOD_SUMMARY; kb.resources.get('r1').classifications.push({labelset:'topic',label:'housing'}); }
 if(scenario==='budget') raw.exec("INSERT INTO spend(day,model,neurons) VALUES ('2026-09-28','model',100)");
 if(scenario.startsWith('flush')) {
  await finishRows(d1,tasks.map(task=>({rid:'r1',task,status:'done',outcome:'dry',result:task.endsWith('topics')?'[\"housing\"]':GOOD_SUMMARY})),2);
  if(scenario==='flush-backpressure') kb.failWrites=new (await load('src/kb.ts')).KbBackpressure('write backpressure',429);
  if(scenario==='flush-full-read-failure') kb.getResource=async()=>{throw new (await load('src/kb.ts')).KbBackpressure('full-read backpressure',429)};
 }
 const stats=await runTick(deps); delete stats.ms; delete stats.skippedShort; delete stats.rejectedNames;
 const q=rows(raw,'SELECT * FROM queue');q.forEach(r=>{delete r.names_rejected;delete r.terminal_reason;delete r.historic;delete r.historic_released});
 const state=rows(raw,"SELECT key,value FROM state WHERE key != 'last_tick' ORDER BY key");
 const spent=rows(raw,'SELECT * FROM spend ORDER BY day,model');
 const modelHash=createHash('sha256').update(JSON.stringify(ai.calls)).digest('hex');
 const resourceHash=createHash('sha256').update(JSON.stringify([...kb.resources])).digest('hex');
 result[`${source}/${scenario}`]={stats,queue:q,state,spent,modelHash,resourceHash,kbCalls:kb.calls};
 raw.close();
}
writeFileSync(process.argv[3],JSON.stringify(result));
console.log(JSON.stringify({cases:Object.keys(result).length}));
