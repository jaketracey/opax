#!/usr/bin/env node
// Writes the app data guard's endpoint fixtures: what /api/app/v1/vic-election really answers, from the
// built hub data, through the Worker's own handler (portal/src/app-vic-election.ts). Never hand-written.
//
//   cd portal && npm run build:search        # the built hub data
//   node scripts/ci/app-endpoint-fixtures.mjs
//
// The overview, and three seats chosen from the data: Albert Park (two candidates nominated without a
// party), the district with the most parties, and the region with the most parties (Council groups, an
// unnamed group and ungrouped candidates). scripts/ci/app-data-guard.sh decodes and draws them with each
// app build still in use (app-endpoint-guard/vic-election-candidates.test.tsx).
// portal/test/vic-party-pages.test.mjs checks their candidates against the committed VEC lists.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {build} from '../../portal/node_modules/esbuild/lib/main.js';

const here=dirname(fileURLToPath(import.meta.url)),root=join(here,'..','..'),out=join(here,'app-endpoint-guard','fixtures');
const bundle=await build({entryPoints:[join(root,'portal/src/app-vic-election.ts')],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*']});
const {appVicElection}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const read=path=>JSON.parse(readFileSync(join(root,'portal/public',path),'utf8'));
const hub=read('hubs/vic-election-2026.json'),places=read('hubs/vic-election-2026-places.json');
const env={VIC_ELECTION_HUB_ENABLED:'true',ASSETS:{async fetch(req){
  return new Response(JSON.stringify(new URL(req.url).pathname.includes('places') ? places : hub),{headers:{'content-type':'application/json'}});}}};
// One fixed moment before polls close, so the answer does not depend on the day it is generated.
const now=new Date('2026-11-16T10:00:00+11:00');
const answer=async path=>{
  const response=await appVicElection(new Request('https://opax.com.au/api/app/v1/vic-election'+path),env,now);
  if(response.status!==200)throw new Error(`${path}: ${response.status}`);
  return response.json();
};
const slug=s=>s.path.split('/').at(-1);
const parties=s=>new Set((s.candidates?.list || []).map(c=>c.party).filter(Boolean)).size;
const most=kind=>hub.seats.filter(s=>s.kind===kind && s.candidates).sort((a,b)=>parties(b)-parties(a) || a.name.localeCompare(b.name))[0];
const seats=[...new Set(['albert-park',slug(most('district')),slug(most('region'))])];
mkdirSync(out,{recursive:true});
writeFileSync(join(out,'overview.json'),JSON.stringify(await answer(''),null,1)+'\n');
for(const id of seats)writeFileSync(join(out,`seat-${id}.json`),JSON.stringify(await answer('/seat/'+id),null,1)+'\n');
console.log(`app-endpoint-fixtures: overview and ${seats.join(', ')}`);
