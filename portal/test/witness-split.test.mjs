import {personNameKey} from '../public/canonical-urls.js';
import {personIndex} from '../src/person-slug.ts';
import * as passageText from '../src/passage-text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { personSpeechCount } from '../../scripts/build_search_catalog.mjs';
import { isWitness, isUnattributed, belongsToScope, scopeFilter, speakerHref, splitSpeakers, splitPerson, personScope, scopedCollaborators } from '../public/speech-attribution.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const scopedContext = (code,context,opts) => runInNewContext(code,{personNameKey,personIndex,...context},opts);
const select = names => source.statements.filter(n => ts.isFunctionDeclaration(n) ? names.includes(n.name?.text) :
  ts.isVariableStatement(n) && n.declarationList.declarations.some(d => names.includes(d.name.getText(source)))).map(n => n.getText(source)).join('\n');
const scope = { state: 'qld', chamber: 'qld_la' };
const plain = x => JSON.parse(JSON.stringify(x));
const roster = JSON.parse(readFileSync(new URL('../public/parliamentarians.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(readFileSync(new URL('../../tests/fixtures/roster-export/witness-split-8e1977cf.json', import.meta.url), 'utf8'));

test('13 QLD review cases restore named parties; witnesses are conserved separately and carry no MP fields', () => {
  for (const name of fixture.qld_review_names) {
    const p = roster.people.find(p => p.name === name);
    const expected = fixture.cases.find(c => c.before.name === name);
    assert.equal(p.full, expected.expected_full);
    assert.equal(p.party, expected.expected_party);
    assert.equal(p.speech_scope.state, scope.state);
    assert.equal(p.speech_scope.chamber, scope.chamber);
    assert.ok(p.speech_scope.service.length);
    assert.equal(Object.hasOwn(p, 'speeches'), false);
    assert.equal(p.transcript.speeches, expected.before.speeches);
    assert.equal(p.witness_rows, undefined);
    for (const key of ['pid', 'party', 'full', 'representation', 'affiliations', 'current']) assert.equal(p.separated_witnesses[key], undefined);
  }
  for (const name of ['Anderson', 'Bishop', 'Kelly', 'Morton', 'Smith']) {
    const p = roster.people.find(p => p.name === name);
    assert.equal(p.full, undefined);
    assert.equal(p.party, undefined);
    assert.equal(p.speech_scope, undefined);
  }
});

test('a witness with a stale MP id and party never belongs to the MP scope or links to their identity page', () => {
  const own = { kind: 'speech', speaker: 'Stewart', state: 'qld', chamber: 'qld_la', speaker_type: 'member', person_id: 'qld_stewart' };
  assert.ok(belongsToScope(own, scope));
  for (const row of [
    { ...own, speaker_type: 'witness' }, { ...own, witness_name: 'Stewart' },
    { ...own, speaker_type: 'chair' }, { ...own, speaker_type: 'unknown' },
    { ...own, state: 'federal', chamber: 'senate_committee' },
    { ...own, state: 'nsw', chamber: 'nsw_la' },
  ]) assert.equal(belongsToScope(row, scope), false);
  const witness = { ...own, speaker_type: 'witness', party: 'Labor' };
  assert.ok(isWitness(witness));
  assert.equal(speakerHref(witness, '/subject/person/stewart'), '/subject/person/stewart?attribution=unattributed');
  assert.ok(isUnattributed({...own,speaker_attribution:'unattributed'}));
});

test('real search code sends own-house filters and drops witness or other-house rows even if the KB returns them', async () => {
  const resources = {};
  const add = (key, state, chamber, speaker_type, person_id) => {
    resources[key] = { slug: 'speech-' + key, title: 'Stewart', origin: { collaborators: ['Stewart'] },
      usermetadata: { classifications: Object.entries({ kind: 'speech', state, chamber, speaker_type, party: 'Labor' }).map(([labelset, label]) => ({ labelset, label })) },
      extra: { metadata: { person_id, date: '2024-06-01' } }, fields: {} };
  };
  add('1','qld','qld_la','member','qld_stewart');
  add('2','federal','senate_committee','witness','11011');
  add('3','qld','qld_la','witness','qld_stewart');
  add('4','nsw','nsw_la','member','nsw_stewart');
  add('5','qld','qld_la','unknown',null);
  const calls = [];
  const api = scopedContext(ts.transpile(select(['searchWindow', 'filterExpression', 'canonicalSpeaker', 'TOPIC_SLUGS', 'speakerAttribution', 'foldName'])) + ';searchWindow', {
    ...passageText, URL, isWitness, belongsToScope, scopeFilter, personScope, scopedCollaborators, SLUG_RE: /^speech-(\d+)$/, DIVISION_SLUG_RE: /^division-/,
    stripListingBoilerplate: s => s, calibrate: s => s,
    label: (r, key) => r.usermetadata.classifications.find(c => c.labelset === key)?.label,
    loadPeople: async () => ({ byFold: new Map([['stewart', { speech_scope: scope }]]) }),
    kbFetch: async (_env, _path, {body}) => { calls.push(body); return Response.json({ resources }); },
  });
  const result = await api({}, { q: 'Stewart', mode: 'keyword', kind: 'speech', topK: 20, url: new URL('https://local.test/api/search?speaker=Stewart') });
  assert.deepEqual(plain(result.results.map(r => r.slug)), ['speech-1']);
  assert.match(JSON.stringify(calls[0].filter_expression), /"chamber","label":"qld_la"/);
  assert.match(JSON.stringify(calls[0].filter_expression), /"not":\{"prop":"label","labelset":"speaker_type","label":"witness"/);
  const separate = await api({}, { q: 'Stewart', mode: 'keyword', kind: 'speech', topK: 20, url: new URL('https://local.test/api/search?speaker=Stewart&attribution=unattributed') });
  assert.match(JSON.stringify(calls[1].filter_expression), /"not":\{"and"/);
  assert.ok(!separate.results.some(r => r.slug === 'speech-1'));
  assert.ok(separate.results.every(r => r.speaker_attribution === 'unattributed'));
  for (const row of separate.results) {
    assert.equal(row.party, null);
    assert.equal(row.person_id, null);
  }
});

test('real answer source cards preserve own-house attribution and clear testimony or other-house MP fields',()=>{
 const api=scopedContext(ts.transpile(select(['askPayload','foldName']))+';askPayload',{
  ...passageText,isWitness,belongsToScope,recordSources:()=>[],
  label:(r,key)=>r.usermetadata.classifications.find(c=>c.labelset===key)?.label,
 });
 const resource=(chamber,speaker_type,metadata={})=>({slug:'speech-1',origin:{collaborators:['Stewart']},
  usermetadata:{classifications:Object.entries({kind:'speech',state:chamber==='qld_la'?'qld':'federal',chamber,speaker_type,party:'Labor'}).map(([labelset,label])=>({labelset,label}))},
  extra:{metadata:{person_id:'11011',...metadata}},fields:{}});
 const resources={own:resource('qld_la','member'),witness:resource('qld_la','witness'),
  contradictory:resource('qld_la','member',{witness_name:'Stewart'}),other:resource('representatives','member')};
 const payload=api({answer:'Evidence.',retrieval_results:{resources}},undefined,undefined,{byFold:new Map([['stewart',{speech_scope:scope}]])});
 assert.equal(payload.sources[0].party,'Labor');
 assert.equal(payload.sources[0].speaker_attribution,null);
 for(const row of payload.sources.slice(1)) {
  assert.equal(row.party,null);assert.equal(row.person_id,null);assert.equal(row.speaker_attribution,'unattributed');
  assert.equal(speakerHref(row,'/subject/person/stewart'),'/subject/person/stewart?attribution=unattributed');
 }
});

test('Ask scope and topic catalog use the same partition; prior citations cannot reintroduce witnesses', async () => {
  const calls = [];
  const api = scopedContext(ts.transpile(select(['scopeSpeakerBody', 'reasonedPositionAnswer', 'apiPersonTopics', 'speakerAttribution', 'foldName', 'canonicalSpeaker', 'TOPIC_SLUGS'])) + ';({scopeSpeakerBody,reasonedPositionAnswer,apiPersonTopics})', {
    URL, AbortSignal, scopeFilter, personScope, scopedCollaborators, MAX_SPEAKER_CHARS: 160, NAME_RE: /^[\w ]+$/, TOPIC_FILTER_PREFIX: '/classification.labels/topic', ASK_SYNC_TIMEOUT_MS:1000,
    buildAskBody:()=>({rag_strategies:[{name:'prequeries'}]}),isRefusal:()=>false,hasUnsupportedQuotes:()=>false,
    askPayload:()=>({answer:'Grounded answer.',citations:{p:[[0,1]]},sources:[]}),
    loadPeople: async () => ({ byFold: new Map([['stewart', { speech_scope: scope }]]) }),
    cachedJson: async (_key, fn) => fn(), json: x => Response.json(x),
    kbFetch: async (_env, _path, {body}) => { calls.push(body); return Response.json({ fulltext: { total: 0, facets: {} } }); },
  });
  const body = { filter_expression: { field: { prop: 'origin_collaborator', collaborator: 'Stewart' } },
    rag_strategies: [{ name: 'prequeries', queries: ['old-witness-resource'] }, { name: 'neighbouring_paragraphs' }] };
  await api.scopeSpeakerBody(body, {}, 'Stewart');
  assert.match(JSON.stringify(body.filter_expression), /qld_la/);
  assert.deepEqual(body.rag_strategies.map(s => s.name), ['neighbouring_paragraphs']);
  await api.apiPersonTopics(new URL('https://local.test/api/person-topics?name=Stewart'), {});
  assert.equal(calls.length, 4);
  for (const call of calls) assert.match(JSON.stringify(call.filter_expression), /qld_la/);
  const fallback=await api.reasonedPositionAnswer({speaker:'Stewart',question:'Why?'},{scope:{speaker:'Stewart'}},{});
  assert.equal(fallback.answer_status,'reasoned');
  assert.match(JSON.stringify(calls[4].filter_expression), /qld_la/);
  assert.deepEqual(plain(calls[4].rag_strategies),[]);
});


test('service date limits reject missing dates, departed MPs and pre-election namesakes', () => {
  for (const name of ['Stewart','Walker','Kirkland','Sullivan']) {
    const p = roster.people.find(p => p.name === name);
    const row = {kind:'speech',state:'qld',chamber:'qld_la',speaker_type:'member'};
    assert.equal(belongsToScope(row,p.speech_scope),false);
    assert.equal(belongsToScope({...row,date:'2023-06-01'},p.speech_scope),false);
    assert.ok(belongsToScope({...row,date:p.speech_scope.service[0].start},p.speech_scope));
    assert.equal(belongsToScope({...row,date:'2027-01-01'},p.speech_scope),false);
    const filters = JSON.stringify(scopeFilter(p.speech_scope));
    for (const interval of p.speech_scope.service) {
      assert.ok(filters.includes(interval.start)); assert.ok(filters.includes(interval.end));
    }
  }
  const former = roster.people.find(p=>p.name==='Stewart');
  assert.equal(belongsToScope({kind:'speech',state:'qld',chamber:'qld_la',date:'2026-03-01'},former.speech_scope),false);
});

test('pending counts cannot credit committee parliamentarians in catalog, description or share card', async () => {
  for (const name of ['Stewart','Walker']) {
    const p = roster.people.find(p=>p.name===name);
    assert.match(personSpeechCount(p),/Count pending exact export/);
    assert.doesNotMatch(personSpeechCount(p),/178|120|Up to|≤/);
  }
  const api = scopedContext(ts.transpile(select(['personMeta']))+';personMeta', {
    SITE_ORIGIN:'https://local.test', CHAMBER_NAMES:{qld_la:'Legislative Assembly'}, STATE_NAMES:{qld:'Queensland parliament'},
    personAt:(people,name)=>people.byFold.get(name.toLowerCase()),personPath:(_people,name)=>'/subject/person/'+name,
    photoIdFor:()=>null,creditLine:async()=>null,
    loadPeople: async()=>({people:roster.people,byFold:new Map(roster.people.map(p=>[p.name.toLowerCase(),p]))}),
    loadMoney: async()=>null, loadPhotos: async()=>({}),
    foldName:s=>s.toLowerCase(), slugIndex:()=>({slugOf:new Map()}),
    personTitle:(name)=>name, hasInterestsRegister:async()=>false, personRole:()=>null,
    num:n=>String(n), years:(a,b)=>`${a}–${b}`, andList:a=>a.join(', '),
    withTail:(a,b)=>a+' '+b, prerenderBlock:()=>'', partyColour:()=>null,
  });
  for (const name of ['Stewart','Walker']) {
    const meta = await api(name,new URL('https://local.test/subject/person/'+name),{});
    assert.match(meta.description,/Count pending exact export/);
    assert.equal(meta.card.stat,undefined);
    assert.doesNotMatch(meta.description,/178|120|Up to|≤/);
    assert.doesNotMatch(meta.description,/2024–2026|Transcript aggregate/);
    assert.doesNotMatch(meta.card.lines.join(' '),/2024–2026|Transcript aggregate/);
  }
});

test('a failed attribution import still starts routing and the Ask builder', async () => {
  const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const boot = app.slice(app.lastIndexOf('Promise.allSettled([attributionReady, uiLabelsReady, growthModulesReady, personUrlsReady])'));
  const called = [];
  const ready = Promise.reject(new Error('simulated missing asset'));
  await scopedContext(boot,{attributionReady:ready,uiLabelsReady:Promise.resolve(),personUrlsReady:Promise.resolve(),growthModulesReady:Promise.resolve(),Promise,
    loadPersonSlugs:()=>called.push('slugs'),initAskBuilder:()=>called.push('ask'),route:()=>called.push('route')});
  assert.deepEqual(called,['slugs','ask','route']);
});

test('full-name and reviewed KB aliases resolve to one scoped print, including Pugh and Crawford', () => {
  for (const p of roster.people.filter(p => p.speech_scope)) {
    for (const alias of splitSpeakers(p)) assert.equal(splitPerson(roster.people, alias.toLowerCase()), p);
    const scoped = personScope(p);
    const row = { kind: 'speech', state: 'qld', chamber: 'qld_la', date: p.speech_scope.service[0].start,
      speaker: splitSpeakers(p)[0] };
    assert.equal(belongsToScope(row, scoped), true);
    assert.equal(belongsToScope({ ...row, speaker: 'An unrelated person' }, scoped), false);
    assert.equal(belongsToScope({ ...row, date: '2027-01-01' }, scoped), false);
    assert.equal(belongsToScope({ ...row, speaker_type: 'witness' }, scoped), false);
    assert.equal(belongsToScope({ ...row, date: null }, scoped), false);
  }
  assert.equal(splitPerson(roster.people, 'Jess Pugh').name, 'Pugh');
  assert.equal(splitPerson(roster.people, 'Cd Crawford').full, 'Craig Crawford');
  const pugh = splitPerson(roster.people, 'Jess Pugh');
  assert.equal(splitPerson([pugh, { ...pugh, name: 'Another print' }], 'Jess Pugh'), null);
  assert.equal(splitPerson(roster.people, 'John Howard'), null);
});

test('full-name routing merges roster-only Pugh, keeps clean pages, and redirects to the print canonical', async () => {
  const reference = { people: [{ name: 'Jess Pugh', aliases: [], electorates: [{ current: true, name: 'Mount Ommaney' }] }] };
  const data = scopedContext(ts.transpile(select(['loadPeople', 'personAt', 'canonicalRoutePath', 'personPath', 'matchSeoRoute', 'foldName'])) + ';({loadPeople,personAt,canonicalRoutePath})', {
    peopleMemo: null, splitSpeakers, Response, URL, missingEntitySlug:()=>false,
    assetJson: async () => structuredClone(roster), loadElectorates: async () => reference,
    slugIndex: people => ({ slugOf: new Map(people.map(p => [p.name, p.name.toLowerCase()])), bySlug: new Map(people.map(p => [p.name.toLowerCase(), p])) }),
  });
  const people = await data.loadPeople({});
  assert.equal(people.people.length, roster.people.length);
  assert.equal(data.personAt(people, 'Jess Pugh').name, 'Pugh');
  const redirect = await data.canonicalRoutePath(new URL('https://local.test/subject/person/Jess%20Pugh'), {});
  assert.equal(typeof redirect, 'string');
  assert.equal(redirect, '/subject/person/pugh');
  for (const p of roster.people.filter(p => !p.speech_scope)) assert.deepEqual(plain(people.byName.get(p.name)), p);
  const app = ts.createSourceFile('app.js',readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  const loader = app.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='loadParliamentarians').getText(app);
  const load = scopedContext(loader+';loadParliamentarians', {
    parliamentariansPromise:null, splitSpeakers, fetch:async()=>Response.json(structuredClone(roster)),
    loadElectorateModule:async()=>({loadPeople:async()=>reference}),
  });
  const browserRoster = await load();
  assert.equal(browserRoster.people.length,roster.people.length);
  assert.equal(browserRoster.people.filter(p=>p.full==='Jess Pugh'||p.name==='Jess Pugh').length,1);
});

test('own-speaker search expands aliases without admitting another speaker; testimony keeps the bare print', async () => {
  const person = roster.people.find(p => p.name === 'Stewart');
  const calls = [];
  const own = { slug: 'speech-1', title: 'Resources', origin: { collaborators: ['Scott Stewart'] },
    usermetadata: { classifications: Object.entries({ kind: 'speech', state: 'qld', chamber: 'qld_la' }).map(([labelset,label]) => ({labelset,label})) },
    extra: { metadata: { date: '2024-06-01', person_id: 'qld_stewart' } }, fields: {} };
  const api = scopedContext(ts.transpile(select(['searchWindow', 'filterExpression', 'canonicalSpeaker', 'TOPIC_SLUGS', 'speakerAttribution', 'foldName'])) + ';searchWindow', {
    ...passageText, URL, isWitness, belongsToScope, scopeFilter, personScope, scopedCollaborators,
    SLUG_RE: /^speech-(\d+)$/, DIVISION_SLUG_RE: /^division-/, stripListingBoilerplate: s=>s, calibrate:s=>s,
    label:(r,key)=>r.usermetadata.classifications.find(c=>c.labelset===key)?.label,
    loadPeople:async()=>({byFold:new Map(splitSpeakers(person).map(n=>[n.toLowerCase(),person]))}),
    kbFetch:async(_env,_path,{body})=>{calls.push(body);return Response.json({resources:{own,wrong:{...own,slug:'speech-2',origin:{collaborators:['Jana Stewart']}}}});},
  });
  const result = await api({}, {q:'*',mode:'keyword',kind:'speech',topK:200,url:new URL('https://local.test/api/search?speaker=Stewart')});
  assert.deepEqual(plain(result.results.map(r=>r.slug)), ['speech-1']);
  assert.match(JSON.stringify(calls[0].filter_expression), /Scott Stewart/);
  assert.match(JSON.stringify(calls[0].filter_expression), /2024-09-30/);
  await api({}, {q:'Stewart',mode:'keyword',kind:'speech',topK:200,url:new URL('https://local.test/api/search?speaker=Stewart&attribution=unattributed')});
  const field = calls[1].filter_expression.field.and[0];
  assert.match(JSON.stringify(field), /"collaborator":"Stewart"/);
  assert.doesNotMatch(JSON.stringify(field), /Scott Stewart/);
});

test('every clean profile keeps current main’s curated roster party precedence', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const partyLine = app.match(/  const party = partyNow \|\|.*;/)[0];
  const party = (roster, spokeAs) => scopedContext(partyLine + ';party', {roster, spokeAs, partyNow:roster?.party_now || null});
  for (const p of roster.people.filter(p=>!p.speech_scope)) for (const spokeAs of ['Labor','Independent',null]) {
    assert.equal(party(p,spokeAs),p.party_now || p.party || spokeAs,p.name);
  }
  assert.equal(party(roster.people.find(p=>p.name==='Latham'),'Labor'),'Independent');
  assert.equal(party(roster.people.find(p=>p.name==="Ken O'Dowd"),'LNP'),'Nationals');
  assert.equal(party(roster.people.find(p=>p.name==='Sullivan'),'Labor'),'Independent');
});
