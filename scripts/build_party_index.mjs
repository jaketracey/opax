#!/usr/bin/env node
// Party members as the division records name them: who voted under each party
// label, how often, and when last. The roster (parliamentarians.json) records one
// party per person, so a member who sat for a minor party ("Gerard Rennick People
// First") is listed under it only here. Party pages join this to the roster in the
// browser, so the file never goes stale against the roster. Many division rows
// give a member's latest party on every vote; the export replaces those a dated
// record contradicts (scripts/vote_parties.py), but where no dated record covers
// the date the latest party stays. So a row says who sat under a label, not from
// when: no start date is published.
//
// State members rarely vote in these records, and the roster has no party for
// most of them, so a minor state party ("Animal Justice Party") had no members at
// all. seat_rosters adds the party a verified electorate roster records for a
// roster person whose own record carries none: the same fallback the person page
// uses (portal/public/roster-party.js), unambiguous or nothing, never a surname.
// Each entry carries the roster's seat and date, and next_election: the first
// election after that date the repository records for the jurisdiction (the
// committed scripts/hubs/<jur>-election-<year>.json configs and the electorate
// release's election dates). After it, the roster no longer says who sits.
// It also lists the members of a chamber's latest dated official list, inside
// the reviewed term window (officialListMembers), party or not: the NSW and SA
// Councils have no verified electorate roster, so their sitting members were listed as former.
//
// bills lists the bills a party's member sponsored, as the bills register records the sponsor's party
// (sponsoredBills): the party pages' "Bills sponsored", and a page for a party the record names only there.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {referenceOnlyPeople,rosterFold,rosterSeatParty} from '../portal/public/roster-party.js';
const SCRIPTS=dirname(fileURLToPath(import.meta.url));
const PUBLIC=join(SCRIPTS,'..','portal','public');
export const PARTY_INDEX='/graph/party-members.json';
// Presiding-officer codes stand in the party field on the days a member chaired.
const NOT_A_PARTY=/^(?:PRES|DPRES|SPK|DSPK|CWM|CHAIR)$/i;

const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;

/** Party -> roster people whose only party is a verified seat roster's, with the roster's seat and date, and
 *  the first recorded election in that jurisdiction after the date (null when none is recorded).
 *  `elections` maps a jurisdiction to its election days. */
export function seatRosterMembers(people,electorates,elections={},reference=[],windows={}) {
  const out={};
  const nextElection=(jur,asOf)=>(elections[jur] || []).filter(d=>ISO_DAY.test(d) && d>asOf).sort()[0] || null;
  // A sitting member with no roster row at all (referenceOnlyPeople): the Worker adds them to its roster, so
  // the index lists them too, with `reference` set. The party is their first current seat's, as the Worker
  // files them; no party, no entry.
  for(const {person,seats} of referenceOnlyPeople(people,reference)){
    const seat=seats[0],party=typeof seat.party==='string' ? seat.party.trim() : '';
    if(!party || !ISO_DAY.test(String(seat.as_of || '')))continue;
    (out[party] ||= []).push({name:person.name,pid:person.legacy_person_id || person.person_id || null,jurisdiction:seat.jurisdiction || null,
      chamber:seat.chamber || null,electorate:seat.name,as_of:seat.as_of,
      next_election:nextElection(seat.jurisdiction,seat.as_of) ||
        (windows[seat.chamber]?.end > seat.as_of ? windows[seat.chamber].end : null),reference:true});
  }
  for(const p of people || []){
    if(p.party_now || p.party)continue;
    const r=rosterSeatParty(p,electorates);
    if(!r)continue;
    const seat=(p.representation || []).find(x=>rosterFold(x.electorate)===rosterFold(r.electorate)) || {};
    const next=nextElection(seat.jurisdiction,r.as_of);
    (out[r.party] ||= []).push({name:p.name,pid:p.pid || null,jurisdiction:seat.jurisdiction || null,chamber:seat.chamber || null,
      electorate:r.electorate,as_of:r.as_of,next_election:next});
  }
  const sorted={};
  for(const party of Object.keys(out).sort((a,b)=>a.localeCompare(b)))
    sorted[party]=out[party].sort((a,b)=>a.name.localeCompare(b.name));
  return sorted;
}

/** Party -> roster people on their chamber's latest dated official list (public/data/roster-list-parties.json,
 *  "official list" observations from scripts/roster_state_evidence.json), added to `out` (seatRosterMembers'
 *  result) in the same shape. Most states publish no verified electorate roster for their upper house, and a
 *  member whose record carries a party (from that same list) was skipped there, so a sitting MLC was listed as
 *  former. The list says who sat on its date. It counts only when it is the chamber's latest, dated inside the
 *  chamber's reviewed current term (scripts/roster_service.json snapshot_party_windows: no window, no entries;
 *  its `end`, the next periodic election, stands in for next_election when no later election is recorded),
 *  and the person has no later dated service record that ends their service. Only an exact full name or listed
 *  alias, or a reviewed Hansard print the list entry records (`prints`, "K.J. Maher"), in a chamber the row sat
 *  in, matches; two parties or seats at that date give nothing. A person already
 *  listed from a seat roster in that chamber is not listed twice. */
export function officialListMembers(people,observations,windows={},elections={},out={}) {
  const nextElection=(jur,asOf)=>(elections[jur] || []).filter(d=>ISO_DAY.test(d) && d>asOf).sort()[0] || null;
  const lists=(observations || []).filter(o=>o?.basis==='official list' && ISO_DAY.test(String(o.as_of || '')) &&
    typeof o.party==='string' && o.party.trim());
  const latest={};
  for(const o of lists)if(!latest[o.chamber] || o.as_of>latest[o.chamber])latest[o.chamber]=o.as_of;
  const names=o=>[o.name,...(o.aliases || [])].map(rosterFold);
  // A reviewed Hansard print the list entry records ("K.J. Maher": SA Hansard names its members only so), for
  // this rule only: roster-party.js never reads `prints`, so a print gives no profile a party.
  const listNames=o=>[...names(o),...(o.prints || []).map(rosterFold)];
  // With no recorded election after the list, the window's reviewed end (the next periodic election) ends it.
  const termEnd=(chamber,date)=>{const end=windows[chamber]?.end;return ISO_DAY.test(String(end || '')) && end>date ? end : null;};
  const listed=new Set(Object.values(out).flat().map(m=>`${rosterFold(m.name)}|${m.chamber}`));
  for(const p of people || []){
    const name=rosterFold(p.name);
    if(!name.includes(' '))continue;
    for(const chamber of p.chambers || []){
      const date=latest[chamber],start=windows[chamber]?.start;
      if(!date || !ISO_DAY.test(String(start || '')) || date<start || listed.has(`${name}|${chamber}`))continue;
      const hits=lists.filter(o=>o.chamber===chamber && o.as_of===date && listNames(o).includes(name));
      if(!hits.length || new Set(hits.map(o=>o.party.trim())).size!==1 || new Set(hits.map(o=>rosterFold(o.electorate))).size!==1)continue;
      const left=(observations || []).some(o=>o?.basis==='service record' && o.chamber===chamber && String(o.as_of || '')>=date &&
        names(o).includes(name));
      if(left)continue;
      const o=hits[0];
      (out[o.party.trim()] ||= []).push({name:p.name,pid:p.pid || null,jurisdiction:o.jurisdiction || null,chamber,
        electorate:o.electorate || null,as_of:date,next_election:nextElection(o.jurisdiction,date) || termEnd(chamber,date)});
      listed.add(`${name}|${chamber}`);
    }
  }
  const sorted={};
  for(const party of Object.keys(out).sort((a,b)=>a.localeCompare(b)))
    sorted[party]=out[party].sort((a,b)=>a.name.localeCompare(b.name) || String(a.chamber).localeCompare(String(b.chamber)));
  return sorted;
}

/** Jurisdiction -> election days the repository records: the electorate release's coverage, and each
 *  committed election hub config (scripts/hubs/vic-election-2026.json: election_day). */
export function recordedElections(manifest,hubsDir=join(SCRIPTS,'hubs')) {
  const out={};
  const add=(jur,day)=>{if(jur && ISO_DAY.test(String(day || '')))(out[jur] ||= new Set()).add(day);};
  for(const [jur,c] of Object.entries(manifest?.coverage?.jurisdictions || {}))for(const day of c.election_dates || [])add(jur,day);
  for(const file of readdirSync(hubsDir).filter(f=>/^[a-z]+-election-\d{4}\.json$/.test(f)).sort())
    add(file.split('-')[0],JSON.parse(readFileSync(join(hubsDir,file),'utf8')).election_day);
  return Object.fromEntries(Object.entries(out).map(([jur,days])=>[jur,[...days].sort()]));
}

function seatRosters(publicRoot) {
  const people=JSON.parse(readFileSync(join(publicRoot,'parliamentarians.json'),'utf8')).people;
  const manifest=JSON.parse(readFileSync(join(publicRoot,'electorates','manifest.json'),'utf8'));
  const asset=url=>JSON.parse(readFileSync(join(publicRoot,...String(url).split('/').filter(Boolean)),'utf8'));
  const elections=recordedElections(manifest);
  const windows=JSON.parse(readFileSync(join(SCRIPTS,'roster_service.json'),'utf8')).snapshot_party_windows;
  const seats=seatRosterMembers(people,asset(manifest.index_url).electorates,elections,asset(manifest.people_url).people,windows);
  const lists=JSON.parse(readFileSync(join(publicRoot,'data','roster-list-parties.json'),'utf8')).observations;
  return officialListMembers(people,lists,windows,elections,seats);
}

/** Party -> the bills the federal bills register records a sponsor of that party for, newest first: key, title,
 *  introduction date and status. Only the sponsor-party spellings the export accepts (public/facts/sponsor-parties.json),
 *  so a party known only as a sponsor's party ("Rex Patrick Team") has a page with its bills. */
export function sponsoredBills(bills,accepted) {
  const ok=new Set(accepted || []),out={};
  for(const b of bills || []){
    const party=String(b?.sponsor_party || '').trim();
    if(!party || !ok.has(party) || !b.key)continue;
    (out[party] ||= []).push({key:b.key,title:b.short_title || b.title || b.key,introduced:b.introduced || null,status:b.status || null});
  }
  const sorted={};
  for(const party of Object.keys(out).sort((a,b)=>a.localeCompare(b)))
    sorted[party]=out[party].sort((a,b)=>String(b.introduced || '').localeCompare(String(a.introduced || '')) || a.key.localeCompare(b.key));
  return sorted;
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
  const read=path=>JSON.parse(readFileSync(join(publicRoot,...path.split('/')),'utf8')),index=read('bills/index.json');
  return {version:1,source:'Recorded divisions (They Vote For You and the parliamentary division records); verified electorate rosters; the federal bills register',
    parties:out,seat_rosters:seatRosters(publicRoot),bills:sponsoredBills(index.bills,read('facts/sponsor-parties.json')),
    bills_generated_at:typeof index.generated_at==='string' ? index.generated_at : null};
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
