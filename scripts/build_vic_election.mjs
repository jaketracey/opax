// Offline projection: official constituency names, existing validated identities
// and existing exports only. No candidate, donor, grant or Hansard text ingestion.
// VEC results (fetch_vec_results.py) and ABS place splits (build_vic_places.py)
// are committed source files beside the VEC config.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {personIndex, personSlug} from '../portal/src/person-slug.ts';
import {personNameKey} from '../portal/public/canonical-urls.js';
import {day, latest} from '../portal/public/hubs-data.js';
import {divisionPlain} from '../portal/public/division-markdown.js';
import {VIC_ELECTION_PATH, VIC_ELECTION_PLACES, VIC_ELECTION_AUTHORISATION_LINE, VIC_ELECTION_CORRECTIONS_EMAIL, VIC_ELECTION_CORRECTIONS_RESPONSE} from '../portal/public/vic-election.js';

// Only the result fields the hub shows: no candidate names.
const contest = r => r && {date:r.date,kind:r.kind || 'general',party:r.party,share:r.share,against:r.against,against_share:r.against_share,margin:r.margin,url:r.url};

export async function buildVicElection(root, configPath = fileURLToPath(new URL('./hubs/vic-election-2026.json',import.meta.url))) {
  const read = async path => JSON.parse(await readFile(join(root,path.replace(/^\//,'')),'utf8'));
  const sibling = name => fileURLToPath(new URL(name,new URL('.',`file://${configPath}`)));
  const [config, results, places, manifest, roster, votes, divisions, interests, corpus] = await Promise.all([
    JSON.parse(await readFile(configPath,'utf8')),JSON.parse(await readFile(sibling('vic-results-2022.json'),'utf8')),
    JSON.parse(await readFile(sibling('vic-places-2025.json'),'utf8')),read('electorates/manifest.json'),read('parliamentarians.json'),
    read('votes.json'),read('divisions/index.json'),read('interests/index.json'),read('corpus.json'),
  ]);
  const index = await read(manifest.index_url);
  // Candidates exist only once the VEC publishes them after nominations close (noon 9 November).
  const nominated = await readFile(sibling('vic-candidates-2026.json'),'utf8').then(JSON.parse,e=>{if(e.code==='ENOENT')return null;throw e;});
  for (const name of Object.keys({...nominated?.districts,...nominated?.regions})) if (!config.districts.concat(config.regions).some(c=>c.name === name)) throw new Error(`Candidates for an unknown constituency: ${name}`);
  // Canonical people are exactly the already-published roster. The few roster-only
  // members use the existing person paths built by build:crawl, never a new join.
  const pathsSource = await readFile(join(root,'person-paths.js'),'utf8');
  const PERSON_PATHS = JSON.parse(pathsSource.split('export const PERSON_PATHS = ')[1].trim().replace(/;$/, ''));
  const publishedPaths = new Set(Object.values(PERSON_PATHS.exact));
  const identity = personIndex(roster.people);
  const voteNames = new Map();
  for (const [name,keys] of Object.entries(votes._names || {})) {
    const key = personNameKey(name);
    voteNames.set(key,[...(voteNames.get(key) || []),...keys]);
  }
  const detailed = [];
  for (const row of divisions.divisions.filter(d => /^vic-(la|lc)-/.test(d.key) && day(d.date) >= '2026-01-01' && day(d.date) <= config.term_end)) {
    const d = await read(`divisions/${row.slug}.json`);
    if (d.jurisdiction !== 'vic' || !['vic_la','vic_lc'].includes(d.house)) throw new Error(`Unexpected Victorian division: ${row.key}`);
    detailed.push(d);
  }
  if (Object.keys(interests._meta.sources).some(k => /^vic/.test(k))) throw new Error('Victorian interests coverage changed; review the election projection');
  const constituencies = [...config.districts,...config.regions];
  if (config.districts.length !== 88 || config.regions.length !== 8 || new Set(constituencies.map(c=>c.name)).size !== 96) throw new Error('Incomplete VEC constituency list');
  const districtNames = config.districts.map(c=>c.name).sort();
  if (JSON.stringify(Object.keys(results.districts).sort()) !== JSON.stringify(districtNames)) throw new Error('VEC results do not cover the 88 districts');
  if (JSON.stringify(places.districts) !== JSON.stringify(districtNames)) throw new Error('ABS place splits do not use the 88 VEC districts');
  const seats = constituencies.map(c => {
    const house = c.kind === 'district' ? 'vic_la' : 'vic_lc';
    const matches = index.electorates.filter(s => s.jurisdiction === 'vic' && s.chamber === house && s.name === c.name && s.status === 'current');
    if (matches.length !== 1) throw new Error(`No exact state electorate: ${c.name}`);
    const seat = matches[0];
    if (seat.representation_status !== 'verified' || seat.representatives.length !== (c.kind === 'district' ? 1 : 5)) throw new Error(`Unverified roster: ${c.name}`);
    const members = seat.representatives.map(({person,party}) => {
      const p = identity.byFold.get(personNameKey(person.name));
      const href = p ? `/subject/person/${identity.slugOf.get(p.name)}` : PERSON_PATHS.exact[person.name];
      if (!href || !publishedPaths.has(href) || !/^\/subject\/person\/[a-z0-9-]+$/.test(href)) throw new Error(`No published person path: ${person.name}`);
      const keys = voteNames.get(personNameKey(person.name)) || [];
      const voteRows = [...new Set([person.legacy_person_id,p?.pid,...keys].filter(Boolean))].map(k=>votes[k])
        .filter(r=>r?.jurisdiction === 'vic' && r.house === house && personNameKey(r.name) === personNameKey(person.name));
      if (voteRows.length > 1) throw new Error(`Ambiguous vote export: ${person.name}`);
      const v = voteRows[0];
      if (v && (v.years[0] !== 2026 || v.years[1] !== 2026)) throw new Error('Victorian vote coverage changed; review its period label');
      const rows = detailed.filter(d=>d.house === house).flatMap(d=>d.members
        .filter(m=>personNameKey(m.name) === personNameKey(person.name))
        .map(m=>({date:day(d.date),title:divisionPlain(d.name || d.question || 'Division'),href:`/doc/${d.slug}`,vote:m.vote,source_url:d.source_url})))
        .sort((a,b)=>b.date.localeCompare(a.date) || a.href.localeCompare(b.href));
      const vicOnly = p && p.states.length === 1 && p.states[0] === 'vic' && !p.speech_scope && !p.speech_count_basis;
      const speeches = vicOnly && p.speeches > 0 ? {count:p.speeches,first:p.first,last:p.last,within_term:p.first >= 2023 && p.last <= 2026} : null;
      // Explicit allowlist excludes all funding, donor, candidate and party fields.
      return {name:person.name,party:party || null,href,source_url:person.source_url,speeches,
        speech_gap:!p || !p.speeches ? 'No speech count is available for this member in the export.' : !vicOnly ? 'The exported speech aggregate cannot isolate Victorian speeches from other parliamentary records.' : null,
        votes:v ? {count:v.divisions_total,ayes:v.ayes,noes:v.noes} : null,
        detailed_count:rows.length,divisions:rows.slice(0,5)};
    });
    const result = results.districts[c.name];
    const list = (c.kind === 'district' ? nominated?.districts : nominated?.regions)?.[c.name];
    return {name:c.name,kind:c.kind,path:`${VIC_ELECTION_PATH}/${personSlug(c.name)}`,source_url:c.source_url,
      region:c.region || null,districts:c.districts || [],boundary_note:c.boundary_note || null,
      formerly:c.formerly || null,created:config.boundaries.created.includes(c.name) && !c.formerly,
      result:result ? {general:contest(result.general),since:contest(result.since) || null} : null,
      candidates:list?.length ? {published:nominated.published,url:nominated.url,list:list.map(x=>({name:x.name,party:x.party || ''}))} : null,
      electorate_url:seat.url,roster_date:seat.representation_as_of,members};
  });
  const updated = latest([config.updated,roster.meta.generated,roster.meta.representation?.updated,day(corpus.version),...seats.map(s=>s.roster_date)]);
  const pages = [{path:VIC_ELECTION_PATH,lastmod:updated},...seats.map(s=>({path:s.path,lastmod:updated}))];
  const data = {authorisation:VIC_ELECTION_AUTHORISATION_LINE,
    corrections:{email:VIC_ELECTION_CORRECTIONS_EMAIL,response:VIC_ELECTION_CORRECTIONS_RESPONSE},
    updated,checked:config.updated,term_start:config.term_start,term_end:config.term_end,election_day:config.election_day,
    nominations_close:config.nominations_close,enrolment_close:config.enrolment_close,postal_close:config.postal_close,
    results_fetched:results.fetched,sources:config.sources,licence:config.licence,boundaries:config.boundaries,
    speech_updated:roster.meta.generated,division_start:detailed.map(d=>day(d.date)).sort()[0] || null,
    division_end:latest(detailed.map(d=>d.date)),interests_available:false,seats,pages};
  await mkdir(join(root,'hubs'),{recursive:true});
  await writeFile(join(root,'hubs/vic-election-2026.json'),JSON.stringify(data)+'\n');
  // The finder's index: place -> [district index, share in tenths of a percent].
  const {suburb,postcode,council,attribution,note} = places;
  await writeFile(join(root,VIC_ELECTION_PLACES.replace(/^\//,'')),JSON.stringify({attribution,note,districts:districtNames,suburb,postcode,council})+'\n');
  return {districts:config.districts.length,regions:config.regions.length,members:seats.reduce((n,s)=>n+s.members.length,0),pages:pages.length};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log('Victorian election:',JSON.stringify(await buildVicElection(fileURLToPath(new URL('../portal/public/',import.meta.url)))));
