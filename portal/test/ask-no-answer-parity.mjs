// Offline gate against origin/main. Preserve all successful response bytes,
// allowing only the additive answered:true field required by this lane.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {loadWorker, offline} from './worker-harness.mjs';
import {question, stubFetch} from './fixtures/ask-no-answer.mjs';

const root = resolve(new URL('../../',import.meta.url).pathname);
const scratch = await mkdtemp(join(tmpdir(),'opax-ask-main-parity-'));
const restore = offline();
try {
  const files = execFileSync('git',['ls-tree','-r','--name-only','origin/main','portal/src'],{cwd:root,encoding:'utf8'}).trim().split('\n');
  for(const file of files) {
    const path = join(scratch,file);
    await mkdir(resolve(path,'..'),{recursive:true});
    await writeFile(path,execFileSync('git',['show','origin/main:'+file],{cwd:root,maxBuffer:8*1024*1024}));
  }
  await symlink(join(root,'portal/public'),join(scratch,'portal/public'));
  await symlink(join(root,'portal/node_modules'),join(scratch,'portal/node_modules'));
  await symlink(join(root,'parli'),join(scratch,'parli'));
  const assets = join(root,'portal/public');
  const current = await loadWorker(join(root,'portal/src/index.ts'),assets);
  const main = await loadWorker(join(scratch,'portal/src/index.ts'),assets);
  const proof = [];
  const cases = [
    {name:'named overview',question},
    {name:'unnamed record',question:'What does the record say about scrutiny?'},
    {name:'explicit speaker',question,speaker:'Melissa McIntosh',kind:'speech'},
    {name:'supported position',question:'What did Melissa McIntosh say about housing?',mode:'position_supported'},
    {name:'supported reasoning fallback',question:'What did Melissa McIntosh say about housing?',mode:'reasoned_supported'},
  ];
  for(const stream of [false,true]) for(const fixture of cases) {
    const ask = async (harness,legacy) => {
      globalThis.fetch = async (input,init) => {
        const response = await stubFetch(input,init,fixture.mode || 'answered');
        if(!legacy || !String(input).endsWith('/ask') || JSON.parse(init.body).generate_answer === false) return response;
        const unwrap = answer => {const parsed=JSON.parse(answer);return 'points' in parsed ? JSON.stringify({points:parsed.points}) : parsed.answer;};
        if(response.headers.get('content-type')?.includes('ndjson')) {
          const items=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
          const raw=items.filter(row=>row.item.type==='answer').map(row=>row.item.text).join('');
          const rest=items.filter(row=>row.item.type!=='answer');
          return new Response([{item:{type:'answer',text:unwrap(raw)}},...rest].map(row=>JSON.stringify(row)).join('\n')+'\n');
        }
        const raw=await response.json();
        return Response.json({...raw,...(raw.answer?{answer:unwrap(raw.answer)}:{})});
      };
      const {name,mode,...input}=fixture;
      const response=await harness.fetch('/api/ask'+(stream?'?stream=1':''),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
      assert.equal(response.status,200);
      const raw=await response.text();
      return stream ? JSON.parse(raw.split('\n\n').find(block=>block.startsWith('event: done')).split('\ndata: ')[1]) : JSON.parse(raw);
    };
    const baseline=await ask(main,true), actual=await ask(current,false);
    assert.equal(actual.answered,true);
    const {answered,...preserved}=actual;
    assert.equal(JSON.stringify(preserved),JSON.stringify(baseline),fixture.name+' '+(stream?'SSE':'sync'));
    proof.push({fixture:fixture.name,route:stream?'SSE':'sync',byte_identical:true});
  }
  await writeFile(join(root,'portal/private/ask-no-answer/fix-main-parity.json'),JSON.stringify({main:execFileSync('git',['rev-parse','origin/main'],{cwd:root,encoding:'utf8'}).trim(),proof},null,2));
  console.log(`${proof.length} supported responses byte-identical to origin/main, apart from additive answered:true.`);
} finally {
  restore();
  await rm(scratch,{recursive:true,force:true});
}
