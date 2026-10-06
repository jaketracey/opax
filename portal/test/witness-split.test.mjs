import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { isWitness, isUnattributed, belongsToScope, scopeFilter, speakerHref } from '../public/speech-attribution.js';

const source = ts.createSourceFile('index.ts', readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
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
    assert.deepEqual(p.speech_scope, scope);
    assert.equal(p.speeches + p.separated_witnesses.speeches, expected.before.speeches);
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
  const api = runInNewContext(ts.transpile(select(['searchWindow', 'filterExpression', 'canonicalSpeaker', 'TOPIC_SLUGS', 'speakerAttribution', 'foldName'])) + ';searchWindow', {
    URL, isWitness, belongsToScope, scopeFilter, SLUG_RE: /^speech-(\d+)$/, DIVISION_SLUG_RE: /^division-/,
    stripListingBoilerplate: s => s, calibrate: s => s, lower_bound: () => 0,
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
 const api=runInNewContext(ts.transpile(select(['askPayload','foldName']))+';askPayload',{
  isWitness,belongsToScope,recordSources:()=>[],
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
  const api = runInNewContext(ts.transpile(select(['scopeSpeakerBody', 'reasonedPositionAnswer', 'apiPersonTopics', 'speakerAttribution', 'foldName', 'canonicalSpeaker', 'TOPIC_SLUGS'])) + ';({scopeSpeakerBody,reasonedPositionAnswer,apiPersonTopics})', {
    URL, AbortSignal, scopeFilter, MAX_SPEAKER_CHARS: 160, NAME_RE: /^[\w ]+$/, TOPIC_FILTER_PREFIX: '/classification.labels/topic', ASK_SYNC_TIMEOUT_MS:1000,
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
