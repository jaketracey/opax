import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'

const built=await build({stdin:{contents:"export * from './src/research-evidence';export * from './src/research-grounding';export * from './src/research-response';",resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,platform:'node',format:'esm'})
const api=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const scope={people:[],parties:[],bills:[],ambiguous:false,unresolved:false}
const passage=(letter,speaker,text)=>({id:letter.repeat(32)+'/t/body/0-300',resource:letter.repeat(32),slug:'speech-'+letter,speaker,text,kind:'speech',date:'2022-09-27',url:'https://example.org/'+letter})
const a=passage('a','Avery Example','I support affordable housing.'),b=passage('b','Blake Sample','I oppose the housing bill.')

test('overlapping and mid-word citation offsets recover complete sentences under their recorded speakers',()=>{
  const text='Avery Example said “I support affordable housing.” Blake Sample said “I oppose the housing bill.”'
  const citations=[{id:a.id,quote:a.text,start:0,end:20},{id:b.id,quote:b.text,start:5,end:9999}],passages=new Map([a,b].map(p=>[p.id,p]))
  const points=api.rangedAnswerPoints({text,citations},passages)
  assert.deepEqual(points.map(p=>p.claim),['Avery Example said “I support affordable housing.”','Blake Sample said “I oppose the housing bill.”'])
  assert.deepEqual(points.map(p=>p.id),[a.id,b.id])
})

test('whole quotations remain atomic when they contain more than one sentence',()=>{
  const text='Avery Example said “I support housing. We need more homes.”',passages=new Map([[a.id,{...a,text:'I support housing. We need more homes.'}]])
  const points=api.rangedAnswerPoints({text,citations:[{id:a.id,quote:'I support housing.',start:0,end:12}]},passages)
  assert.equal(points.length,1);assert.equal(points[0].claim,text)
})

test('stored Q03 offsets preserve all written words once and produce complete JSON/SSE answers',async()=>{
  const {draft,sources}=JSON.parse(readFileSync(new URL('./fixtures/research-q03-ranges.json',import.meta.url),'utf8'))
  const passages=new Map(draft.citations.map(c=>{const s=sources.find(s=>c.id.startsWith(s.resource+'/'));assert.ok(s);return [c.id,{...s,id:c.id,text:s.snippet}]}))
  const points=api.rangedAnswerPoints(draft,passages)
  assert.equal(points.map(p=>p.claim).join(' '),draft.text.replace(/\s+/g,' ').trim())
  const question='How do Labor and the Coalition differ on nuclear power?'
  const written=api.verifyResearchPoints(points,passages,question,scope,undefined,{people:[...passages.values()].map(p=>({name:p.speaker}))})
  assert.ok(written)
  for(const stream of [false,true]){
    const response=stream?new Response('event: done\ndata: '+JSON.stringify(written)+'\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json(written)
    const wire=await(await api.withAnswerLanguage(response,question)).text(),out=stream?JSON.parse(wire.match(/^data: (.+)$/m)[1]):JSON.parse(wire)
    assert.doesNotMatch(out.answer,/\bwate\b|\bewables\b|opposition to n["”]/)
    assert.equal((out.answer.match(/The clearest Labor statement/g)??[]).length,1)
    assert.match(out.answer,/Ed Husic/);assert.match(out.answer,/Coalition/)
  }
})
