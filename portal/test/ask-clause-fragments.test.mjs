import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
const b=await build({entryPoints:[new URL('../src/research-claims.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'})
const {sentenceFragment}=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'))
test('a clause left by a removed claim is a fragment',()=>{
 for(const t of ['while a rebate to SOCOG would not extend to premium price tickets.','- while a rebate to SOCOG would not extend to premium price tickets.',' and Pasquale Minniti, the Commission formed the opinion that Senior Constable Arduino Silvestri and Sergeant Bill Harrison engaged in misconduct.','which the Commission described as serious.'])
  assert.equal(sentenceFragment(t),true,t)
})
test('ordinary sentences, including capitalised connectives, are not fragments',()=>{
 for(const t of ['John Howard said the GST would stay at 10 per cent.','While in office, he argued it was fairer.','And the Commission formed the opinion that the officer engaged in misconduct.','- On 20 August 2001 he argued that rolling back the GST would cut services.'])
  assert.equal(sentenceFragment(t),false,t)
})
