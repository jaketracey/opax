#!/usr/bin/env node
// Party members as the division records name them: who voted under each party
// label, how often, and when last. The roster (parliamentarians.json) records one
// party per person, so a member who sat for a minor party ("Gerard Rennick People
// First") is listed under it only here. Party pages join this to the roster in the
// browser, so the file never goes stale against the roster. The division export
// labels a member with their latest party on every vote, so a row says who sat
// under a label, not from when: no start date is published.
//
// State members rarely vote in these records, and the roster has no party for
// most of them, so a minor state party ("Animal Justice Party") had no members at
// all. seat_rosters adds the party a verified electorate roster records for a
// roster person whose own record carries none: the same fallback the person page
// uses (portal/public/roster-party.js), unambiguous or nothing, never a surname.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {rosterSeatParty} from '../portal/public/roster-party.js';
const PUBLIC=join(dirname(fileURLToPath(import.meta.url)),'..','portal','public');
export const PARTY_INDEX='/graph/party-members.json';
// Presiding-officer codes stand in the party field on the days a member chaired.
const NOT_A_PARTY=/^(?:PRES|DPRES|SPK|DSPK|CWM|CHAIR)$/i;

/** Party -> roster people whose only party is a verified seat roster's, with the roster's date and seat. */
export function seatRosterMembers(people,electorates) {
  const out={};
  for(const p of people || []){
    if(p.party_now || p.party)continue;
    const r=rosterSeatParty(p,electorates);
    if(!r)continue;
    (out[r.party] ||= []).push({name:p.name,pid:p.pid || null,electorate:r.electorate,as_of:r.as_of});
  }
  const sorted={};
  for(const party of Object.keys(out).sort((a,b)=>a.localeCompare(b)))
    sorted[party]=out[party].sort((a,b)=>a.name.localeCompare(b.name));
  return sorted;
}

function seatRosters(publicRoot) {
  const people=JSON.parse(readFileSync(join(publicRoot,'parliamentarians.json'),'utf8')).people;
  const manifest=JSON.parse(readFileSync(join(publicRoot,'electorates','manifest.json'),'utf8'));
  const index=JSON.parse(readFileSync(join(publicRoot,...String(manifest.index_url).split('/').filter(Boolean)),'utf8'));
  return seatRosterMembers(people,index.electorates);
}

export function partyIndexFile(publicRoot=PUBLIC) {
  const dir=join(publicRoot,'divisions');
  const parties=new Map();
  for(const file of readdirSync(dir).filter(f=>/^division-.+\.json$/.test(f)).sort()){
    const division=JSON.parse(readFileSync(join(dir,file),'utf8'));
    const date=String(division.date || '');
    for(const m of division.members || []){
      const party=String(m.party || '').trim(), name=String(m.name || '').trim();
      if(!party || !name || NOT_A_PARTY.test(party))continue;
      const members=parties.get(party) || new Map();
      parties.set(party,members);
      const key=m.person_slug || name.toLowerCase();
      const row=members.get(key) || {name,slug:m.person_slug || null,last:date,divisions:0};
      row.divisions++;
      if(date>row.last)row.last=date;
      members.set(key,row);
    }
  }
  const out={};
  for(const [party,members] of [...parties].sort((a,b)=>a[0].localeCompare(b[0])))
    out[party]=[...members.values()].sort((a,b)=>b.last.localeCompare(a.last) || a.name.localeCompare(b.name));
  return {version:1,source:'Recorded divisions (They Vote For You and the parliamentary division records); verified electorate rosters',
    parties:out,seat_rosters:seatRosters(publicRoot)};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const text=JSON.stringify(partyIndexFile())+'\n',path=join(PUBLIC,PARTY_INDEX);
  const before=(()=>{try{return readFileSync(path,'utf8')}catch{return ''}})();
  if(process.argv.includes('--check')){
    if(before!==text){console.error('build_party_index: stale; run build:parties.');process.exitCode=1;}
    else console.log('build_party_index: current.');
  }else if(before!==text){writeFileSync(path,text);console.log('build_party_index: written.');}
  else console.log('build_party_index: current.');
}
