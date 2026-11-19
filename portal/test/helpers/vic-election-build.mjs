import {copyFile, mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';

const publicRoot = new URL('../../public/',import.meta.url);
const sources = new URL('../../../scripts/hubs/',import.meta.url);

/** Minimal offline build inputs in a disposable copy, never the live worktree. */
export async function withVicElectionBuild(run) {
  const scratch=await mkdtemp(join(tmpdir(),'opax-vic-api-build-'));
  try {
    const root=join(scratch,'public'),configRoot=join(scratch,'sources');
    const read=async path=>JSON.parse(await readFile(new URL(path,publicRoot),'utf8'));
    const manifest=await read('electorates/manifest.json');
    const divisions=await read('divisions/index.json');
    // The hub reads its pinned roster release (scripts/build_vic_election.mjs), whatever the manifest says.
    const config=JSON.parse(await readFile(new URL('vic-election-2026.json',sources),'utf8'));
    const indexes=[...new Set([manifest.index_url,`/electorates/releases/${config.roster_release}/index.json`])].map(url=>url.replace(/^\//,''));
    // A seat recorded vacant is read from its own detail file (public/seat-vacancy.js).
    const vacant=(await Promise.all(indexes.map(read))).flatMap(index=>index.electorates
      .filter(e=>e.jurisdiction==='vic'&&e.representation_status==='verified'&&!e.representatives.length).map(e=>e.detail_url.replace(/^\//,'')));
    const paths=[...new Set(['electorates/manifest.json',...indexes,...vacant,'parliamentarians.json','votes.json',
      'divisions/index.json','interests/index.json','corpus.json','person-paths.js',
      ...divisions.divisions.filter(d=>/^vic-(la|lc)-/.test(d.key)).map(d=>`divisions/${d.slug}.json`)])];
    for(const path of paths) {
      await mkdir(dirname(join(root,path)),{recursive:true});
      await copyFile(new URL(path,publicRoot),join(root,path));
    }
    await mkdir(configRoot,{recursive:true});
    for(const name of ['vic-election-2026.json','vic-results-2022.json','vic-places-2025.json','vic-candidates-2026.json'])
      await copyFile(new URL(name,sources),join(configRoot,name));
    await run({root,configRoot,configPath:join(configRoot,'vic-election-2026.json')});
  } finally {await rm(scratch,{recursive:true,force:true});}
}
