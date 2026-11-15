import './helpers/vic-election-clock.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {build} from 'esbuild';
import {buildVicElection} from '../../scripts/build_vic_election.mjs';
import {approvedLinks, candidateId, linksFile, matchVicCandidates, rosterMembers, VIC_CANDIDATE_LINKS} from '../../scripts/vic_candidate_links.mjs';
import {validateVicElection} from '../src/vic-election-data.ts';
import {VIC_ELECTION_ASSET} from '../public/vic-election.js';
import {withVicElectionBuild} from './helpers/vic-election-build.mjs';

// The reviewed set: VEC candidate id to the roster member it is linked to. A link is
// published only for these pairs. Changing this list is a decision for a person, made
// with the evidence in scripts/hubs/vic-candidate-links-2026.json.
const VERIFIED = new Map([
  ['district:albert-park:taylor-nina',"Nina Taylor"],['district:ashwood:fregon-matt',"Matt Fregon"],['district:bellarine:marchant-alison',"Alison Marchant"],
  ['district:bentleigh:staikos-nick',"Nick Staikos"],['district:berwick:battin-brad',"Brad Battin"],['district:box-hill:hamer-paul',"Paul Hamer"],
  ['district:brighton:newbury-james',"James Newbury"],['district:broadmeadows:matthews-ward-kathleen',"Kathleen Matthews-Ward"],['district:bulleen:guy-matthew',"Matthew Guy"],
  ['district:bundoora:brooks-colin',"Colin Brooks"],['district:carrum:kilkenny-sonya',"Sonya Kilkenny"],['district:caulfield:southwick-david',"David Southwick"],
  ['district:clarinda:tak-meng-heang',"Meng Heang Tak"],['district:cranbourne:richards-pauline',"Pauline Richards"],['district:dandenong:williams-gabrielle',"Gabrielle Williams"],
  ['district:eildon:mcleish-cindy',"Cindy McLeish"],['district:eltham:ward-vicki',"Vicki Ward"],['district:eureka:settle-michaela',"Michaela Settle"],
  ['district:euroa:cleeland-annabelle',"Annabelle Cleeland"],['district:evelyn:vallence-bridget',"Bridget Vallence"],['district:footscray:hall-katie',"Katie Hall"],
  ['district:frankston:edbrooke-paul',"Paul Edbrooke"],['district:gippsland-south:obrien-danny',"Danny O'Brien"],['district:glen-waverley:mullahy-john',"John Mullahy"],
  ['district:greenvale:walters-iwan',"Iwan Walters"],['district:hastings:mercurio-paul',"Paul Mercurio"],['district:hawthorn:pesutto-john',"John Pesutto"],
  ['district:ivanhoe:carbines-anthony',"Anthony Carbines"],['district:kalkallo:spence-ros',"Ros Spence"],['district:kew:wilson-jess',"Jess Wilson"],
  ['district:kororoit:grigorovitch-luba',"Luba Grigorovitch"],['district:lara:george-ella',"Ella George"],['district:laverton:connolly-sarah',"Sarah Connolly"],
  ['district:lowan:kealy-emma',"Emma Kealy"],['district:melbourne:sandell-ellen',"Ellen Sandell"],['district:mildura:benham-jade',"Jade Benham"],
  ['district:monbulk:de-martino-daniela',"Daniela De Martino"],['district:mordialloc:richardson-tim',"Tim Richardson"],['district:morwell:cameron-martin',"Martin Cameron"],
  ['district:mulgrave:foster-eden',"Eden Foster"],['district:narracan:farnham-wayne',"Wayne Farnham"],['district:narre-warren-north:wilson-belinda',"Belinda Wilson"],
  ['district:nepean:marsh-anthony',"Anthony Marsh"],['district:niddrie:carroll-ben',"Ben Carroll"],['district:northcote:theophanous-kat',"Kat Theophanous"],
  ['district:oakleigh:dimopoulos-steve',"Steve Dimopoulos"],['district:ovens-valley:mccurdy-tim',"Tim McCurdy"],['district:pascoe-vale:cianflone-anthony',"Anthony Cianflone"],
  ['district:point-cook:hilakari-mathew',"Mathew Hilakari"],['district:polwarth:riordan-richard',"Richard Riordan"],['district:prahran:westaway-rachel',"Rachel Westaway"],
  ['district:preston:lambert-nathan',"Nathan Lambert"],['district:richmond:de-vietri-gabrielle',"Gabrielle de Vietri"],['district:ripon:haylett-martha',"Martha Haylett"],
  ['district:sandringham:rowswell-brad',"Brad Rowswell"],['district:south-west-coast:britnell-roma',"Roma Britnell"],['district:st-albans:suleyman-natalie',"Natalie Suleyman"],
  ['district:sunbury:bull-josh',"Josh Bull"],['district:tarneit:wight-dylan',"Dylan Wight"],['district:thomastown:halfpenny-bronwyn',"Bronwyn Halfpenny"],
  ['district:warrandyte:werner-nicole',"Nicole Werner"],['district:wendouree:addison-juliana',"Juliana Addison"],['district:werribee:lister-john',"John Lister"],
  ['district:williamstown:horne-melissa',"Melissa Horne"],['district:yan-yean:kathage-lauren',"Lauren Kathage"],['region:eastern-victoria:heath-renee',"Renee Heath"],
  ['region:eastern-victoria:bath-melina',"Melina Bath"],['region:eastern-victoria:bourman-jeff',"Jeff Bourman"],['region:north-eastern-metropolitan:welch-richard',"Richard Welch"],
  ['region:north-eastern-metropolitan:puglielli-aiv',"Aiv Puglielli"],['region:northern-metropolitan:mulholland-evan',"Evan Mulholland"],['region:northern-metropolitan:gray-barberio-anasina',"Anasina Gray-Barberio"],
  ['region:northern-metropolitan:watt-sheena',"Sheena Watt"],['region:northern-victoria:symes-jaclyn',"Jaclyn Symes"],['region:northern-victoria:tyrrell-rikkie-lee',"Rikkie-Lee Tyrrell"],
  ['region:northern-victoria:purcell-georgie',"Georgie Purcell"],['region:northern-victoria:broad-gaelle',"Gaelle Broad"],['region:south-eastern-metropolitan:tarlamis-lee',"Lee Tarlamis"],
  ['region:south-eastern-metropolitan:galea-michael',"Michael Galea"],['region:south-eastern-metropolitan:payne-rachel',"Rachel Payne"],['region:south-eastern-metropolitan:limbrick-david',"David Limbrick"],
  ['region:south-eastern-metropolitan:hermans-ann-marie',"Ann-Marie Hermans"],['region:southern-metropolitan:berger-john',"John Berger"],['region:southern-metropolitan:davis-david',"David Davis"],
  ['region:southern-metropolitan:crozier-georgie',"Georgie Crozier"],['region:southern-metropolitan:copsey-katherine',"Katherine Copsey"],['region:western-metropolitan:luu-trung',"Trung Luu"],
  ['region:western-metropolitan:blandthorn-lizzie',"Lizzie Blandthorn"],['region:western-metropolitan:stitt-ingrid',"Ingrid Stitt"],['region:western-victoria:mansfield-sarah',"Sarah Mansfield"],
  ['region:western-victoria:ermacora-jacinta',"Jacinta Ermacora"],['region:western-victoria:mcarthur-bev',"Bev McArthur"],
]);
// Name matches the automatic rule does not verify, with its reasons. Each is linked only
// because a person recorded a public source that names the member and the seat contested
// (hub ruling, 16 November 2026). Without that record the pair stays unlinked.
const REVIEWED = {
  'district:geelong:couzens-christine':[/^Name variant/],
  'district:mornington:crewther-chris':[/another parliament/],
  'district:preston:fowles-william':[/^Name variant/,/^Different seat/,/^No registered party/],
  'district:ringwood:mcgowan-nick':[/^Different seat/],
  'region:eastern-victoria:erdogan-enver':[/^Different seat/],
  'region:north-eastern-metropolitan:batchelor-ryan':[/^Different seat/],
  'region:northern-metropolitan:mcintosh-tom':[/^Different seat/],
  'region:western-metropolitan:deeming-moira':[/^Party differs/],
};
// How the sources name each contested seat.
const SEAT_NAMED = {
  'district:geelong:couzens-christine':/geelong/,'district:mornington:crewther-chris':/mornington/,
  'district:preston:fowles-william':/preston/,'district:ringwood:mcgowan-nick':/ringwood/,
  'region:eastern-victoria:erdogan-enver':/eastern victoria/,'region:north-eastern-metropolitan:batchelor-ryan':/north[- ]east(ern)? metro/,
  'region:northern-metropolitan:mcintosh-tom':/north(ern)? metro/,'region:western-metropolitan:deeming-moira':/western metro/,
};

const root = new URL('../public/',import.meta.url), hubs = new URL('../../scripts/hubs/',import.meta.url);
const json = async url => JSON.parse(await readFile(url,'utf8'));
const asset = path => json(new URL(path.replace(/^\//,''),root));
const manifest = await asset('electorates/manifest.json');
const [index,people,roster,nominated,file,data] = await Promise.all([asset(manifest.index_url),asset(manifest.people_url),
  asset('parliamentarians.json'),json(new URL('vic-candidates-2026.json',hubs)),json(new URL(VIC_CANDIDATE_LINKS,hubs)),asset(VIC_ELECTION_ASSET)]);
const members = rosterMembers(index,roster,people);
const match = matchVicCandidates(nominated,members);
const compiled = await build({entryPoints:[new URL('../src/vic-election.ts',import.meta.url).pathname],bundle:true,platform:'browser',format:'esm',write:false,external:['node:*']});
const {renderVicElection} = await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const seat = name => data.seats.find(s=>s.name === name);
const exact = text => text.toLowerCase().replace(/[’‘ʼ`']/g,'').replace(/[-‐‑–]/g,' ').replace(/\s+/g,' ').trim();
const vecRows = ['districts','regions'].flatMap(key=>Object.entries(nominated[key]).flatMap(([name,list])=>list.map(c=>{
  const parts = c.name.split(', ');
  return parts.length === 2 ? {seat:name,row:c.name,surname:exact(parts[0]),given:exact(parts[1])} : {seat:name,row:c.name,surname:null,given:exact(c.name)};
})));
// VEC rows already verified as another roster member's.
const linkedRows = new Set(file.verified.map(v=>`${v.seat.replace(/ (District|Region)$/,'')}|${v.candidate}`));
const linked = d => d.seats.flatMap(s=>(s.candidates?.list ?? []).filter(c=>c.href).map(c=>[candidateId(s.kind,s.name,c.name),c.href]));

test('the committed mapping is exactly the reviewed set, with the evidence for each pair',()=>{
  assert.deepEqual(file.verified.map(v=>[v.candidate_id,v.member]),[...VERIFIED]);
  assert.deepEqual(file.reviewed.map(r=>r.candidate_id),Object.keys(REVIEWED));
  for (const r of file.reviewed) {
    assert.equal(r.reviewed_on,'2026-11-16');assert.ok(r.review_evidence.length > 40,r.candidate_id);
    REVIEWED[r.candidate_id].forEach((reason,i)=>assert.match(r.reasons[i],reason));assert.equal(r.reasons.length,REVIEWED[r.candidate_id].length);
    // At least two public sources, and one that names both the candidate's surname and the seat contested.
    const surname = r.candidate.split(', ')[0].toLowerCase(), words = source => `${source.title ?? ''} ${source.quote}`.toLowerCase();
    assert.ok(r.sources.length >= 2,r.candidate_id);
    for (const source of r.sources) assert.ok(new URL(source.url).protocol === 'https:' && source.publisher && source.quote,r.candidate_id);
    assert.ok(r.sources.some(source=>words(source).includes(surname) && SEAT_NAMED[r.candidate_id].test(words(source))),`${r.candidate_id}: no source names ${surname} and the seat`);
  }
  for (const v of file.verified) {
    assert.match(v.person_id,/^person_[0-9a-f]{24}$/);
    assert.match(v.evidence.seat,new RegExp(`^Held ${v.seat} on the roster dated 2026-09-09$`));
    assert.ok(v.evidence.party.vec && v.evidence.party.roster && v.evidence.roster_source.startsWith('https://www.parliament.vic.gov.au/members/'),v.candidate_id);
  }
  assert.equal(new Set([...file.verified,...file.reviewed].map(v=>v.person_id)).size,100);
  assert.deepEqual(file.counts,{candidates:1037,members:128,verified:92,ambiguous:0,unmatched:937,not_candidate:27,unresolved:0,reviewed:8,linked:100,held:1});
});

test('the committed mapping is what the matcher finds in the current VEC lists and roster',()=>{
  assert.deepEqual(linksFile(match,nominated,file),file);
  // Every name match is accounted for: verified by rule, or ambiguous by rule and settled by a recorded review.
  assert.deepEqual(match.ambiguous.map(a=>a.candidate_id),Object.keys(REVIEWED));
  assert.deepEqual(file.ambiguous,[]);
  // The rule alone marks no one whose surname is still on the VEC lists, whatever the given name, seat or party.
  const open = ['Jackson Taylor','Maree Edwards','Tim Read','Tim Bull','Mary-Anne Thomas',"Michael O'Brien",'Darren Cheeseman','Joe McCracken'];
  assert.deepEqual(match.unresolved.map(m=>m.member),open);
  assert.deepEqual(match.unresolved.find(m=>m.member === "Michael O'Brien").candidates.map(c=>c.candidate),["O'BRIEN, Michelle"]);
  assert.deepEqual([match.not_candidate.length,match.counts.not_candidate,match.counts.unresolved],[20,20,8]);
  // Seven of those are marked on a person's recorded check with a public source; one is held (below).
  assert.deepEqual(file.not_candidate.filter(m=>m.reviewed_on).map(m=>[m.member,m.reviewed_on]),open.filter(name=>name !== 'Tim Read').map(name=>[name,'2026-11-16']));
  for (const m of file.not_candidate) {
    // Nominations have closed: where no VEC row has the surname, the VEC lists alone support the mark.
    const surname = exact(m.member).split(' ').at(-1);
    const rows = vecRows.filter(r=>(r.surname ?? r.given).split(' ').includes(surname) && !linkedRows.has(`${r.seat}|${r.row}`));
    assert.equal(rows.length > 0,Boolean(m.reviewed_on),m.member);
    if (m.reviewed_on) assert.ok(m.sources?.length >= 1,m.member);
    for (const source of m.sources ?? []) assert.ok(new URL(source.url).protocol === 'https:' && source.publisher && (source.quote || source.finding),m.member);
    // The quoted words name the member and say they are leaving.
    const quoted = (m.sources ?? []).flatMap(source=>source.quote ?? []);
    if (m.sources) assert.ok(quoted.some(q=>q.includes(m.member)) && /retire|retiring|vacated|not seeking|not running|bowing out|follow suit/i.test(quoted.join(' ')),m.member);
  }
  // Evidence quotes are text as it appears on the page: no bracketed inserts, no joined fragments; a table row says so.
  for (const entry of [...file.reviewed,...file.not_candidate]) for (const source of entry.sources ?? []) {
    assert.doesNotMatch(source.quote ?? '',/[\[\]]| \/ |\.\.\.|…/,entry.member);
    assert.equal(source.url.endsWith('/guide/candidates'),/^ABC candidate table row: [^|]+( \| [^|]+){2,3}$/.test(source.quote ?? ''),entry.member);
    assert.equal(source.context,undefined);
  }
  // Where published pages differ in tone, the closed VEC lists are cited first and the difference is recorded.
  const cheeseman = file.not_candidate.find(m=>m.member === 'Darren Cheeseman');
  assert.deepEqual(cheeseman.sources.map(x=>[new URL(x.url).hostname,Boolean(x.finding),Boolean(x.quote)]),[['www.vec.vic.gov.au',true,false],['www.tallyroom.com.au',false,true]]);
  assert.match(cheeseman.review_evidence,/intentions for this election are currently unclear/);
  const tierney = file.not_candidate.find(m=>m.member === 'Gayle Tierney');
  assert.deepEqual(tierney.sources.map(x=>[x.url,x.section,x.quote]),[['https://www.abc.net.au/news/elections/vic/2026/guide/lc-preview','Western Victoria','Sitting Labor MLC Gayle Tierney is retiring after 20 years in the upper house']]);
  assert.ok(file.reviewed.find(r=>r.member === 'Ryan Batchelor').sources[0].quote.endsWith('its second-elected MLC Ryan Batchelor has switched districts and is contesting North-Eastern Metropolitan this election.'));
  const allan = file.not_candidate.find(m=>m.member === 'Jacinta Allan');
  assert.deepEqual(allan.sources.map(x=>[x.url,x.quote]),[['https://www.pollbludger.net/vic2026/LA.htm?s=BendigoEast','Bendigo East will be vacated at the election with the retirement of Jacinta Allan']]);
  // No stored quote or note gives anyone a current office.
  assert.doesNotMatch(JSON.stringify(file),/\b(?:the Premier|Minister|Treasurer|Speaker|whip|Opposition Leader|President of)\b/i);
  // SOMYUREK is on no VEC row, so that member is marked on the VEC lists alone.
  assert.deepEqual(file.not_candidate.filter(m=>!m.sources).map(m=>m.member),['Adem Somyurek']);
  assert.deepEqual(vecRows.filter(r=>/somyurek/.test(`${r.surname} ${r.given}`)),[]);
  // No one is left to check. One member is held by a reviewed exception: no link, no mark, present wording.
  assert.deepEqual(file.members_to_check,[]);
  assert.deepEqual(file.held.map(m=>[m.member,m.seat,m.held_on]),[['Tim Read','Brunswick District','2026-11-16']]);
  assert.doesNotMatch(JSON.stringify(file),/\b(?:death|died|deceased|the late|vacant|resign)/i);
  assert.ok(file.not_candidate.some(m=>m.member === 'Maree Edwards' && m.seat === 'Bendigo West District'));
  const named = new Set([...file.verified,...file.reviewed,...file.not_candidate,...file.members_to_check,...file.held].map(e=>e.person_id));
  assert.equal(named.size,128);
});

test('the built election data links the reviewed pairs and no others',()=>{
  const hrefs = new Map(members.map(m=>[m.person_id,data.seats.flatMap(s=>s.members).find(x=>x.name === m.name).href]));
  assert.deepEqual(linked(data).sort(),[...file.verified,...file.reviewed].map(v=>[v.candidate_id,hrefs.get(v.person_id)]).sort());
  assert.equal(linked(data).length,VERIFIED.size + Object.keys(REVIEWED).length);
  for (const [id] of linked(data)) assert.ok(VERIFIED.has(id) || id in REVIEWED,`Unverified pair linked: ${id}`);
  // A rule-verified candidate stands in the seat whose roster member the link opens; only a reviewed pair may differ.
  for (const s of data.seats) for (const c of s.candidates.list) if (c.href && VERIFIED.has(candidateId(s.kind,s.name,c.name))) assert.ok(s.members.some(m=>m.href === c.href),c.name);
  assert.deepEqual(data.seats.flatMap(s=>s.members.filter(m=>m.not_candidate).map(m=>m.name)).sort(),file.not_candidate.map(m=>m.member).sort());
});

// Invented people: the matcher's rules, one doubt at a time.
const member = (name, seat, party, extra = {}) => ({person_id:'person_'+name.replace(/\W/g,'').toLowerCase(),name,aliases:[],party,seat,kind:'district',
  source_url:'https://www.parliament.vic.gov.au/members/x/',as_of:'2026-09-09',other_parliament:false,...extra});
const lists = districts => ({published:'2026-11-11',url:'https://www.vec.vic.gov.au/voting/2026-state-election',districts,regions:{}});
const run = (districts, roster) => matchVicCandidates(lists(districts),roster);

test('a link needs the same name, the seat held and the same party',()=>{
  const wren = member('Wren Halloway','Lowan','Labor');
  const ok = run({Lowan:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'},{name:'KETCH, Rowan',party:''}]},[wren]);
  assert.deepEqual(ok.verified.map(v=>v.candidate_id),['district:lowan:halloway-wren']);
  assert.deepEqual([ok.ambiguous,ok.counts.unmatched],[[],1]);
  const doubt = (districts, roster = [wren]) => { const r = run(districts,roster); assert.deepEqual(r.verified,[]); return r.ambiguous.flatMap(a=>a.reasons).join(' | '); };
  assert.match(doubt({Mildura:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]}),/^Different seat: standing in Mildura District, on the roster for Lowan District$/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wren',party:'Family First Victoria'}]}),/^Party differs/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wren',party:''}]}),/^No registered party/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wrenna',party:'Australian Labor Party - Victorian Branch'}]}),/^Name variant/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}],Mildura:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]}),/Same name on the VEC lists in 2 seats/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]},[member('Wren Halloway','Lowan','Labor',{other_parliament:true})]),/another parliament/);
  assert.match(doubt({Lowan:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]},[wren,member('Wren Halloway','Mildura','Labor',{person_id:'person_other'})]),/more than one roster member/);
  // A different person with the member's surname is no match at all.
  assert.deepEqual(run({Lowan:[{name:'HALLOWAY, Iona',party:'Australian Labor Party - Victorian Branch'}]},[wren]).counts,
    {candidates:1,members:1,verified:0,ambiguous:0,unmatched:1,not_candidate:0,unresolved:1});
});

test('a federal member of the same name keeps a Victorian roster member unlinked',()=>{
  const victorian = index.electorates.find(s=>s.jurisdiction === 'vic' && s.name === 'Mornington').representatives[0].person;
  assert.ok(people.people.some(p=>p.jurisdiction === 'federal' && p.name === victorian.name));
  assert.equal(members.find(m=>m.person_id === victorian.person_id).other_parliament,true);
  assert.equal(members.filter(m=>m.other_parliament).length,2);
});

test('"not a candidate" needs the VEC lists to rule the member out',()=>{
  const wren = member('Wren Halloway','Lowan','Labor');
  const status = (districts, roster = [wren]) => { const r = run(districts,roster); return [r.not_candidate.length,r.unresolved.length]; };
  assert.deepEqual(status({Lowan:[{name:'KETCH, Rowan',party:'Australian Labor Party - Victorian Branch'}]}),[1,0]);
  // Any remaining candidate with the surname leaves the member for a person: a formal given name
  // (Bill as William), another seat and no registered party would otherwise pass as someone else.
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Iona',party:'Australian Greens Victoria'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Gwendolyn',party:''}]}),[0,1]);
  assert.deepEqual(status({Lowan:[{name:'HALLOWAY, Iona',party:'Australian Greens Victoria'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'QUILL-HALLOWAY, Willa',party:'Australian Greens Victoria'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'IONA HALLOWAY',party:''}]}),[0,1]);
  // A surname the member is known by only through an alias counts too.
  const alias = [member('Wren Halloway','Lowan','Labor',{aliases:['Wren Ketch']})];
  assert.deepEqual(status({Mildura:[{name:'KETCH, Gwendolyn',party:''}]},alias),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'KETCH, Gwendolyn',party:''}]}),[1,0]);
  // Only a candidate verified as another roster member is set aside.
  const iona = member('Iona Halloway','Mildura','Greens');
  const both = run({Mildura:[{name:'HALLOWAY, Iona',party:'Australian Greens Victoria'}]},[wren,iona]);
  assert.deepEqual([both.verified.length,both.not_candidate.map(m=>m.member),both.unresolved],[1,['Wren Halloway'],[]]);
  // A name match that is not verified never becomes "not a candidate".
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]}),[0,0]);
});

// The committed file with the recorded reviews taken out: what the rule and the recorded sources support.
const ruleOnly = {...file,reviewed:[],not_candidate:file.not_candidate.filter(m=>!m.reviewed_on)};

test('the build publishes only what the committed file and a fresh match both support',()=>{
  const full = approvedLinks(file,match);
  assert.deepEqual([full.links.size,full.notCandidate.size,full.dropped],[100,27,[]]);
  const {links,notCandidate,dropped} = approvedLinks(ruleOnly,match);
  assert.deepEqual([...links.keys()],[...VERIFIED.keys()]);assert.deepEqual([notCandidate.size,dropped],[20,[]]);
  const published = r => [[...r.links].join(),[...r.notCandidate].join()];
  const ambiguous = match.ambiguous[0], open = match.unresolved.find(m=>m.member === "Michael O'Brien"), heldMember = file.held[0];
  const pair = {candidate_id:ambiguous.candidate_id,person_id:ambiguous.person_id};
  const review = {reviewed_on:'2026-11-17',review_evidence:'Checked against a published announcement.'};
  const sources = [{url:'https://example.org/announcement',publisher:'Example',quote:'Named in the announcement.'}];
  const out = {person_id:open.person_id,member:open.member};
  // Each altered entry is refused and named; nothing else about the approved set changes.
  for (const [bad,error,lost] of [
    [{...ruleOnly,verified:[...file.verified,pair]},/Unverified candidate link: district:geelong:couzens-christine/],
    [{...ruleOnly,verified:[{...file.verified[0],person_id:file.verified[1].person_id},...file.verified.slice(1)]},/Unverified candidate link: district:albert-park:taylor-nina/,file.verified[0].candidate_id],
    [{...ruleOnly,verified:[...file.verified,file.verified[0]]},/Duplicate candidate link/],
    [{...ruleOnly,reviewed:[pair]},/Unverified candidate link: district:geelong/],
    [{...ruleOnly,reviewed:[{...pair,reviewed_on:'2026-11-17',review_evidence:' ',sources}]},/Unverified candidate link: district:geelong/],
    // A review without a public source, or with one that is not an https address or has no quoted words, is not enough.
    [{...ruleOnly,reviewed:[{...pair,...review}]},/Unverified candidate link: district:geelong/],
    [{...ruleOnly,reviewed:[{...pair,...review,sources:[]}]},/Unverified candidate link: district:geelong/],
    [{...ruleOnly,reviewed:[{...pair,...review,sources:[{...sources[0],url:'http://example.org/'}]}]},/Unverified candidate link: district:geelong/],
    [{...ruleOnly,reviewed:[{...pair,...review,sources:[{...sources[0],quote:''}]}]},/Unverified candidate link: district:geelong/],
    // Our own reading of a list is not a quotation, and never stands alone.
    [{...ruleOnly,reviewed:[{...pair,...review,sources:[{url:sources[0].url,finding:'Not on the list.'}]}]},/Unverified candidate link: district:geelong/],
    [{...ruleOnly,reviewed:[{...file.verified[1],...review,sources,candidate_id:'district:lowan:nobody'}]},/Unverified candidate link: district:lowan:nobody/],
    // A member the rule leaves open needs a person's dated check and a source.
    [{...ruleOnly,not_candidate:[...ruleOnly.not_candidate,out]},/Unconfirmed "not a candidate": Michael O'Brien/],
    [{...ruleOnly,not_candidate:[...ruleOnly.not_candidate,{...out,sources}]},/Unconfirmed "not a candidate": Michael O'Brien/],
    [{...ruleOnly,not_candidate:[...ruleOnly.not_candidate,{...out,...review}]},/Unconfirmed "not a candidate": Michael O'Brien/],
    // A held member is never marked and never linked, whatever is recorded.
    [{...ruleOnly,not_candidate:[...ruleOnly.not_candidate,{person_id:heldMember.person_id,member:heldMember.member,...review,sources}]},/Unconfirmed "not a candidate": Tim Read/],
    [{...ruleOnly,reviewed:[{candidate_id:'district:ripon:read-megan',person_id:heldMember.person_id,...review,sources}]},/Link to a held member: district:ripon:read-megan/],
    [{...ruleOnly,not_candidate:[...ruleOnly.not_candidate,{person_id:file.verified[0].person_id,member:file.verified[0].member,...review,sources}]},/Unconfirmed "not a candidate": Nina Taylor/],
  ]) {
    const result = approvedLinks(bad,match);
    assert.equal(result.dropped.length,1);assert.match(result.dropped[0],error);
    assert.deepEqual(published(result),published({links:new Map([...links].filter(([id])=>id !== lost)),notCandidate}),String(error));
  }
  // A member linked by review cannot also be marked as not standing.
  const both = approvedLinks({...file,not_candidate:[...file.not_candidate,{person_id:file.reviewed[0].person_id,member:file.reviewed[0].member,...review,sources}]},match);
  assert.deepEqual(both.dropped,['Unconfirmed "not a candidate": Chris Couzens']);assert.equal(both.notCandidate.size,27);
  // A person's recorded review is the only way past the automatic rule, and it is kept on a rerun.
  const promoted = {...ruleOnly,reviewed:[{...pair,...review,sources}],not_candidate:[...ruleOnly.not_candidate,{...out,...review,sources}]};
  const approved = approvedLinks(promoted,match);
  assert.equal(approved.links.get(pair.candidate_id),pair.person_id);assert.ok(approved.notCandidate.has(open.person_id));
  const rerun = linksFile(match,nominated,promoted);
  assert.deepEqual([rerun.reviewed.length,rerun.ambiguous.length,rerun.members_to_check.length,rerun.counts.linked,rerun.counts.not_candidate],[1,7,6,93,21]);
  assert.deepEqual(rerun.held,file.held);
  // With nothing recorded, the rule links 92 and marks the 20 whose surname is on no VEC row.
  assert.deepEqual(linksFile(match,nominated,{}).counts,{candidates:1037,members:128,verified:92,ambiguous:8,unmatched:937,not_candidate:20,unresolved:8,reviewed:0,linked:92,held:0});
});

test('a stale or altered mapping stops the election build, and the published file is left as it was',async()=>{
  await withVicElectionBuild(async({root:out,configRoot,configPath})=>{
    const peoplePath = manifest.people_url.replace(/^\//,'');
    await mkdir(dirname(join(out,peoplePath)),{recursive:true});await copyFile(new URL(peoplePath,root),join(out,peoplePath));
    const linksPath = join(configRoot,VIC_CANDIDATE_LINKS), assetPath = join(out,VIC_ELECTION_ASSET);
    await writeFile(linksPath,JSON.stringify(file));
    const summary = await buildVicElection(out,configPath);
    assert.deepEqual([summary.candidate_links,summary.not_candidate],[100,27]);
    const good = await readFile(assetPath,'utf8');
    assert.deepEqual(linked(JSON.parse(good)),linked(data));
    // Without its recorded review, an ambiguous pair moved into the verified list is refused.
    const ambiguous = match.ambiguous[0];
    await writeFile(linksPath,JSON.stringify({...file,reviewed:file.reviewed.slice(1),verified:[...file.verified,{candidate_id:ambiguous.candidate_id,person_id:ambiguous.person_id}]}));
    await assert.rejects(buildVicElection(out,configPath),/Stale vic-candidate-links-2026\.json: Unverified candidate link: district:geelong:couzens-christine\. Run node scripts\/vic_candidate_links\.mjs/);
    // A reviewed mark whose source was removed is refused, and so is a mark on the held member.
    await writeFile(linksPath,JSON.stringify({...file,not_candidate:file.not_candidate.map(({sources,...m})=>m.member === 'Maree Edwards' ? m : {...m,...sources ? {sources} : {}})}));
    await assert.rejects(buildVicElection(out,configPath),/Unconfirmed "not a candidate": Maree Edwards/);
    await writeFile(linksPath,JSON.stringify({...file,not_candidate:[...file.not_candidate,{...file.held[0],reviewed_on:'2026-11-17',review_evidence:'x',sources:file.not_candidate[0].sources}]}));
    await assert.rejects(buildVicElection(out,configPath),/Unconfirmed "not a candidate": Tim Read/);
    // A changed VEC party for a linked candidate, or a list without them, is refused too.
    await writeFile(linksPath,JSON.stringify(file));
    const changed = structuredClone(nominated);changed.districts['Albert Park'].find(c=>c.name === 'TAYLOR, Nina').party = 'Family First Victoria';
    await writeFile(join(configRoot,'vic-candidates-2026.json'),JSON.stringify(changed));
    await assert.rejects(buildVicElection(out,configPath),/Unverified candidate link: district:albert-park:taylor-nina/);
    changed.districts['Albert Park'] = changed.districts['Albert Park'].filter(c=>c.name !== 'TAYLOR, Nina');
    await writeFile(join(configRoot,'vic-candidates-2026.json'),JSON.stringify(changed));
    await assert.rejects(buildVicElection(out,configPath),/Unverified candidate link: district:albert-park:taylor-nina/);
    // A new candidate with a marked member's surname sends the member back to a person.
    const added = structuredClone(nominated);added.districts.Mildura.push({name:'ALLAN, Gwendolyn',party:''});
    await writeFile(join(configRoot,'vic-candidates-2026.json'),JSON.stringify(added));
    await assert.rejects(buildVicElection(out,configPath),/Unconfirmed "not a candidate": Jacinta Allan/);
    assert.equal(await readFile(assetPath,'utf8'),good);
  });
});

test('the reader rejects a link that is not to a roster member, a second link to one member, and a mark that contradicts a link',()=>{
  const copy = () => structuredClone(data), albert = d => d.seats.find(s=>s.name === 'Albert Park');
  assert.ok(validateVicElection(copy()));
  const cases = [
    d => { albert(d).candidates.list.find(c=>!c.href).href = '/subject/person/someone-else'; },
    d => { albert(d).candidates.list.find(c=>!c.href).href = albert(d).members[0].href; },
    d => { albert(d).candidates.list.find(c=>c.href).href = 'https://example.com/'; },
    d => { albert(d).candidates.list.find(c=>!c.href).href = seat('Lowan').members[0].href; },
    d => { albert(d).members[0].not_candidate = true; },
    d => { albert(d).members[0].not_candidate = false; },
    d => { const s = d.seats.find(s=>s.name === 'Bendigo West'); s.candidates = null; },
  ];
  for (const change of cases) { const d = copy(); change(d); assert.throws(()=>validateVicElection(d),/Invalid election asset/,String(change)); }
});

test('a linked candidate is shown exactly like any other, apart from a plain text link',()=>{
  const albert = seat('Albert Park'), html = renderVicElection(data,albert).html;
  const rows = [...html.match(/<ol class="vic-candidates" role="list">([\s\S]*?)<\/ol>/)[1].matchAll(/<li>[\s\S]*?<\/li>/g)].map(m=>m[0]);
  assert.equal(rows.length,albert.candidates.list.length);
  const taylor = rows.find(r=>r.includes('TAYLOR, Nina'));
  assert.ok(taylor.includes('<span class="vic-candidate-name"><a href="/subject/person/nina-taylor">TAYLOR, Nina</a></span>'));
  assert.equal(rows.filter(r=>r.includes('<a ')).length,1);
  // Without the anchor the page is identical: no portrait, class, badge or extra text.
  const plain = renderVicElection(data,{...albert,candidates:{...albert.candidates,list:albert.candidates.list.map(({href,...c})=>c)}}).html;
  assert.equal(html.replace(/<a href="\/subject\/person\/nina-taylor">TAYLOR, Nina<\/a>/,'TAYLOR, Nina'),plain);
  assert.doesNotMatch(rows.join(''),/<img|portrait|photo/);
  // Region lists follow the same rule.
  const region = seat('Eastern Victoria'), regionHtml = renderVicElection(data,region).html;
  for (const c of region.candidates.list) assert.ok(regionHtml.includes(c.href ? `<span class="vic-candidate-name"><a href="${c.href}">${c.name}</a></span>` : `<span class="vic-candidate-name">${c.name}</span>`),c.name);
});

test('"Not a candidate in 2026" appears only for members the VEC lists rule out, with the source',()=>{
  const note = '<p class="hub-meta">Not a candidate in 2026. Source: <a href="https://www.vec.vic.gov.au/voting/2026-state-election">VEC candidate lists</a>, published 11 Nov 2026.</p>';
  const bendigo = renderVicElection(data,seat('Bendigo West')).html;
  assert.ok(bendigo.includes(`<h2 class="ui-section-title">What Maree Edwards has done</h2><article class="vic-member">${note}`));
  assert.ok(renderVicElection(data,seat('Bendigo East')).html.includes(`<h2 class="ui-section-title">What Jacinta Allan has done</h2><article class="vic-member">${note}`));
  assert.ok(renderVicElection(data,seat('Malvern')).html.includes(`<h2 class="ui-section-title">What Michael O'Brien has done</h2><article class="vic-member">${note}`.replace("'",'&#39;')));
  // A member standing again, in the same seat or another, is never marked.
  for (const name of ['Albert Park','Geelong','Mornington','Ringwood','Sunbury','Brunswick']) assert.doesNotMatch(renderVicElection(data,seat(name)).html,/Not a candidate/,name);
  const region = seat('Eastern Victoria'), html = renderVicElection(data,region).html;
  assert.deepEqual(region.members.filter(m=>m.not_candidate).map(m=>m.name),['Harriet Shing']);
  assert.equal(html.split(note).length,2);
  const shing = html.slice(html.indexOf('Harriet Shing</a>'));
  assert.equal(shing.indexOf('</h3>'+note),shing.indexOf('</h3>'));
  // The hub page and the dissolution wording are unchanged by this.
  assert.doesNotMatch(renderVicElection(data,null).html,/Not a candidate/);
  assert.match(bendigo,/<dt>Held by<\/dt><dd><a href="\/subject\/person\/maree-edwards">Maree Edwards<\/a>/);
});

// Hub ruling, 16 November 2026: no one standing anywhere, in either house, may be marked
// "Not a candidate in 2026". This check is deliberately separate from the matcher: it reads the
// VEC rows itself and compares surname plus given name exactly, normalising only case,
// apostrophes and hyphens. Extra given names on the VEC row still count as the same name.
const standing = name => {
  const wanted = exact(name);
  return vecRows.filter(r=>r.surname === null ? r.given === wanted
    : wanted.endsWith(' '+r.surname) && (r.given === wanted.slice(0,-r.surname.length).trim() || r.given.startsWith(wanted.slice(0,-r.surname.length))));
};

test('no member marked "Not a candidate in 2026" is on any of the 1,037 VEC rows, in either house',()=>{
  assert.equal(vecRows.length,1037);
  // The check finds people who are standing: in their own seat, in another seat, and in the other house.
  assert.deepEqual(standing('Nina Taylor').map(r=>r.seat),['Albert Park']);
  assert.deepEqual(standing('Nick McGowan').map(r=>[r.seat,r.row]),[['Ringwood','McGOWAN, Nick']]);
  assert.deepEqual(standing('Enver Erdogan').map(r=>r.seat),['Eastern Victoria']);
  assert.deepEqual(standing("Danny O'Brien").map(r=>r.row),["O'BRIEN, Danny"]);
  assert.deepEqual(standing('Kathleen Matthews-Ward').map(r=>r.row),['MATTHEWS-WARD, Kathleen']);
  assert.deepEqual(standing('Brendan Thomas').map(r=>r.row),['THOMAS, Brendan William']);
  assert.deepEqual(standing('Davinder Kaur').map(r=>r.row),['DAVINDER KAUR']);
  const rosterNames = new Map(members.map(m=>[m.person_id,[m.name,...m.aliases]]));
  const marked = data.seats.flatMap(s=>s.members.filter(m=>m.not_candidate).map(m=>m.name));
  assert.deepEqual(marked.slice().sort(),file.not_candidate.map(m=>m.member).sort());assert.equal(marked.length,27);
  const caught = file.not_candidate.flatMap(m=>rosterNames.get(m.person_id).flatMap(name=>standing(name).map(r=>`${m.member}: ${r.row} in ${r.seat}`)));
  assert.deepEqual(caught,[]);
  // The ruled case: no "O'BRIEN, Michael" anywhere; "O'BRIEN, Michelle" in Evelyn is a different given name.
  assert.deepEqual(standing("Michael O'Brien"),[]);
  assert.deepEqual(vecRows.filter(r=>r.surname === 'obrien').map(r=>[r.row,r.seat]),[["O'BRIEN, Michelle",'Evelyn'],["O'BRIEN, Danny",'Gippsland South']]);
  // And no member with a linked candidate anywhere is marked.
  const linkedHrefs = new Set(linked(data).map(([,href])=>href));
  for (const s of data.seats) for (const m of s.members) assert.ok(!(m.not_candidate && linkedHrefs.has(m.href)),m.name);
  // Had a moved member been marked, this check would name them.
  assert.deepEqual(['Tom McINTOSH','Tom McIntosh','Ryan Batchelor','Moira Deeming'].map(name=>standing(name).map(r=>r.seat).join()),['Northern Metropolitan','Northern Metropolitan','North-Eastern Metropolitan','Western Metropolitan']);
});

// Every seat, every member: each of the 128 is in exactly one state, and none is left unresolved.
test('every seat resolves each roster member to one outcome: linked, marked, or held by a reviewed exception',()=>{
  const linkedHrefs = new Set(linked(data).map(([,href])=>href));
  const heldNames = new Set(file.held.map(m=>m.member));
  const outcomes = {linked:0,marked:0,held:0};
  assert.equal(data.seats.length,96);
  for (const s of data.seats) for (const m of s.members) {
    const states = [linkedHrefs.has(m.href) && 'linked',m.not_candidate && 'marked',heldNames.has(m.name) && 'held'].filter(Boolean);
    assert.equal(states.length,1,`${s.name}: ${m.name} is ${states.join(' and ') || 'unresolved'}`);
    outcomes[states[0]]++;
  }
  assert.deepEqual(outcomes,{linked:100,marked:27,held:1});
  // The held seat is published exactly as before this change: no mark, no linked candidate, same page.
  const brunswick = seat('Brunswick');
  assert.deepEqual([brunswick.members.length,brunswick.members[0].not_candidate,brunswick.candidates.list.some(c=>c.href)],[1,undefined,false]);
  assert.deepEqual(Object.keys(brunswick.members[0]).sort(),['detailed_count','divisions','href','name','party','source_url','speech_gap','speeches','votes']);
  assert.doesNotMatch(renderVicElection(data,brunswick).html,/Not a candidate|vacant/i);
  // No candidate anywhere links to the held member's record.
  assert.ok(!linkedHrefs.has(brunswick.members[0].href));
});
