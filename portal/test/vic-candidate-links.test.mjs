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
// Name matches that are not verified: never linked, listed for a person to check.
const AMBIGUOUS = {
  'district:geelong:couzens-christine':[/^Name variant/],
  'district:mornington:crewther-chris':[/another parliament/],
  'district:preston:fowles-william':[/^Name variant/,/^Different seat/,/^No registered party/],
  'district:ringwood:mcgowan-nick':[/^Different seat/],
  'region:eastern-victoria:erdogan-enver':[/^Different seat/],
  'region:north-eastern-metropolitan:batchelor-ryan':[/^Different seat/],
  'region:northern-metropolitan:mcintosh-tom':[/^Different seat/],
  'region:western-metropolitan:deeming-moira':[/^Party differs/],
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
const linked = d => d.seats.flatMap(s=>(s.candidates?.list ?? []).filter(c=>c.href).map(c=>[candidateId(s.kind,s.name,c.name),c.href]));

test('the committed mapping is exactly the reviewed set, with the evidence for each pair',()=>{
  assert.deepEqual(file.verified.map(v=>[v.candidate_id,v.member]),[...VERIFIED]);
  assert.deepEqual(file.reviewed,[]);
  for (const v of file.verified) {
    assert.match(v.person_id,/^person_[0-9a-f]{24}$/);
    assert.match(v.evidence.seat,new RegExp(`^Held ${v.seat} on the roster dated 2026-09-09$`));
    assert.ok(v.evidence.party.vec && v.evidence.party.roster && v.evidence.roster_source.startsWith('https://www.parliament.vic.gov.au/members/'),v.candidate_id);
  }
  assert.equal(new Set(file.verified.map(v=>v.person_id)).size,VERIFIED.size);
  assert.deepEqual(file.counts,{candidates:1037,members:128,verified:92,ambiguous:8,unmatched:937,not_candidate:27,unresolved:1});
});

test('the committed mapping is what the matcher finds in the current VEC lists and roster',()=>{
  assert.deepEqual(linksFile(match,nominated,file),file);
  // Every name match is accounted for: verified, or listed with the reason it is not.
  assert.deepEqual(Object.fromEntries(file.ambiguous.map(a=>[a.candidate_id,a.reasons.length])),
    Object.fromEntries(Object.entries(AMBIGUOUS).map(([id,reasons])=>[id,reasons.length])));
  for (const a of file.ambiguous) AMBIGUOUS[a.candidate_id].forEach((reason,i)=>assert.match(a.reasons[i],reason));
  assert.deepEqual(file.members_to_check.map(m=>[m.member,m.candidates.map(c=>c.candidate)]),[["Michael O'Brien",["O'BRIEN, Michelle"]]]);
  assert.ok(file.not_candidate.some(m=>m.member === 'Maree Edwards' && m.seat === 'Bendigo West District'));
  const named = new Set([...file.verified,...file.ambiguous,...file.not_candidate,...file.members_to_check].map(e=>e.person_id));
  assert.equal(named.size,128);
});

test('the built election data links the reviewed pairs and no others',()=>{
  const hrefs = new Map(members.map(m=>[m.person_id,data.seats.flatMap(s=>s.members).find(x=>x.name === m.name).href]));
  assert.deepEqual(linked(data).sort(),file.verified.map(v=>[v.candidate_id,hrefs.get(v.person_id)]).sort());
  assert.equal(linked(data).length,VERIFIED.size);
  for (const [id] of linked(data)) assert.ok(VERIFIED.has(id),`Unverified pair linked: ${id}`);
  for (const id of Object.keys(AMBIGUOUS)) assert.ok(!linked(data).some(([x])=>x === id),`Ambiguous pair linked: ${id}`);
  // A linked candidate stands in the seat whose roster member the link opens.
  for (const s of data.seats) for (const c of s.candidates.list) if (c.href) assert.ok(s.members.some(m=>m.href === c.href),c.name);
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
  const status = districts => { const r = run(districts,[wren]); return [r.not_candidate.length,r.unresolved.length]; };
  assert.deepEqual(status({Lowan:[{name:'KETCH, Rowan',party:'Australian Labor Party - Victorian Branch'}]}),[1,0]);
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Iona',party:'Australian Greens Victoria'}]}),[1,0]);
  // The same surname with the member's seat, party or first initial is left for a person.
  assert.deepEqual(status({Lowan:[{name:'HALLOWAY, Iona',party:'Australian Greens Victoria'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Iona',party:'Australian Labor Party - Victorian Branch'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Willa',party:'Australian Greens Victoria'}]}),[0,1]);
  assert.deepEqual(status({Mildura:[{name:'QUILL-HALLOWAY, Willa',party:'Australian Greens Victoria'}]}),[0,1]);
  // A name match that is not verified never becomes "not a candidate".
  assert.deepEqual(status({Mildura:[{name:'HALLOWAY, Wren',party:'Australian Labor Party - Victorian Branch'}]}),[0,0]);
});

test('the build publishes only what the committed file and a fresh match both support',()=>{
  const {links,notCandidate,dropped} = approvedLinks(file,match);
  assert.deepEqual([...links.keys()],[...VERIFIED.keys()]);assert.deepEqual([notCandidate.size,dropped],[27,[]]);
  const published = r => [[...r.links].join(),[...r.notCandidate].join()];
  const ambiguous = file.ambiguous[0], open = file.members_to_check[0];
  const pair = {candidate_id:ambiguous.candidate_id,person_id:ambiguous.person_id};
  const review = {reviewed_on:'2026-11-17',review_evidence:'Checked against the Parliament of Victoria member page.'};
  // Each altered entry is left out and named; nothing else about the published set changes.
  for (const [bad,error,lost] of [
    [{...file,verified:[...file.verified,pair]},/Unverified candidate link: district:geelong:couzens-christine/],
    [{...file,verified:[{...file.verified[0],person_id:file.verified[1].person_id},...file.verified.slice(1)]},/Unverified candidate link: district:albert-park:taylor-nina/,file.verified[0].candidate_id],
    [{...file,verified:[...file.verified,file.verified[0]]},/Duplicate candidate link/],
    [{...file,reviewed:[pair]},/Unverified candidate link: district:geelong/],
    [{...file,reviewed:[{...pair,reviewed_on:'2026-11-17',review_evidence:' '}]},/Unverified candidate link: district:geelong/],
    [{...file,reviewed:[{...file.verified[1],...review,candidate_id:'district:lowan:nobody'}]},/Unverified candidate link: district:lowan:nobody/],
    [{...file,not_candidate:[...file.not_candidate,{person_id:open.person_id,member:open.member}]},/Unconfirmed "not a candidate": Michael O'Brien/],
    [{...file,not_candidate:[...file.not_candidate,{person_id:file.verified[0].person_id,member:file.verified[0].member}]},/Unconfirmed "not a candidate": Nina Taylor/],
  ]) {
    const result = approvedLinks(bad,match);
    assert.equal(result.dropped.length,1);assert.match(result.dropped[0],error);
    assert.deepEqual(published(result),published({links:new Map([...links].filter(([id])=>id !== lost)),notCandidate}),String(error));
  }
  // A person's recorded review is the only way past the automatic rule, and it is kept on a rerun.
  const promoted = {...file,reviewed:[{...pair,...review}],not_candidate:[...file.not_candidate,{person_id:open.person_id,member:open.member,...review}]};
  const approved = approvedLinks(promoted,match);
  assert.equal(approved.links.get(pair.candidate_id),pair.person_id);assert.ok(approved.notCandidate.has(open.person_id));
  const rerun = linksFile(match,nominated,promoted);
  assert.deepEqual([rerun.reviewed.length,rerun.ambiguous.length,rerun.members_to_check.length,rerun.counts.verified,rerun.counts.not_candidate],[1,7,0,93,28]);
});

test('the election build leaves out a stale or altered mapping entry and publishes the rest',async t=>{
  await withVicElectionBuild(async({root:out,configRoot,configPath})=>{
    const peoplePath = manifest.people_url.replace(/^\//,'');
    await mkdir(dirname(join(out,peoplePath)),{recursive:true});await copyFile(new URL(peoplePath,root),join(out,peoplePath));
    const linksPath = join(configRoot,VIC_CANDIDATE_LINKS);
    await writeFile(linksPath,JSON.stringify(file));
    await buildVicElection(out,configPath);
    const built = JSON.parse(await readFile(join(out,VIC_ELECTION_ASSET),'utf8'));
    assert.deepEqual(linked(built),linked(data));
    const ambiguous = file.ambiguous[0];
    await writeFile(linksPath,JSON.stringify({...file,verified:[...file.verified,{candidate_id:ambiguous.candidate_id,person_id:ambiguous.person_id}]}));
    const warnings = [];t.mock.method(console,'warn',message=>warnings.push(message));
    const rebuilt = async () => { const summary = await buildVicElection(out,configPath); return [summary,JSON.parse(await readFile(join(out,VIC_ELECTION_ASSET),'utf8'))]; };
    let [summary,result] = await rebuilt();
    assert.deepEqual([summary.candidate_links,summary.not_candidate,summary.links_left_out],[92,27,1]);
    assert.deepEqual(linked(result),linked(data));
    assert.deepEqual(warnings,['Victorian candidate links: left out. Unverified candidate link: district:geelong:couzens-christine']);
    // A changed VEC party for a linked candidate takes the link away; the member is not then marked as not standing.
    await writeFile(linksPath,JSON.stringify(file));
    const changed = structuredClone(nominated);changed.districts['Albert Park'].find(c=>c.name === 'TAYLOR, Nina').party = 'Family First Victoria';
    await writeFile(join(configRoot,'vic-candidates-2026.json'),JSON.stringify(changed));
    [summary,result] = await rebuilt();
    assert.deepEqual([summary.candidate_links,summary.links_left_out],[91,1]);
    assert.deepEqual(linked(result),linked(data).filter(([id])=>id !== 'district:albert-park:taylor-nina'));
    assert.ok(!result.seats.find(s=>s.name === 'Albert Park').members[0].not_candidate);
    // A list without the member's name does not mark them either: the committed file never said so.
    changed.districts['Albert Park'] = changed.districts['Albert Park'].filter(c=>c.name !== 'TAYLOR, Nina');
    await writeFile(join(configRoot,'vic-candidates-2026.json'),JSON.stringify(changed));
    [summary,result] = await rebuilt();
    assert.ok(!result.seats.find(s=>s.name === 'Albert Park').members[0].not_candidate);
    assert.equal(result.seats.flatMap(s=>s.members).filter(m=>m.not_candidate).length,27);
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
  for (const name of ['Albert Park','Geelong','Malvern','Mornington']) assert.doesNotMatch(renderVicElection(data,seat(name)).html,/Not a candidate/,name);
  const region = seat('Eastern Victoria'), html = renderVicElection(data,region).html;
  assert.deepEqual(region.members.filter(m=>m.not_candidate).map(m=>m.name),['Harriet Shing']);
  assert.equal(html.split(note).length,2);
  assert.match(html,new RegExp(`Harriet Shing</a>[^\n]*?</h3>${note.replace(/[.?]/g,'\\$&')}`));
  // The hub page and the dissolution wording are unchanged by this.
  assert.doesNotMatch(renderVicElection(data,null).html,/Not a candidate/);
  assert.match(bendigo,/<dt>Held by<\/dt><dd><a href="\/subject\/person\/maree-edwards">Maree Edwards<\/a>/);
});
