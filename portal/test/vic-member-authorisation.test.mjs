// Victorian member pages carry the election authorisation, in the seat pages' exact words, until the
// polls close at 6 pm on Saturday 28 November 2026 Melbourne time, and not from that instant on.
process.env.TZ = 'UTC';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {VIC_ELECTION_AUTHORISATION_LINE,VIC_ELECTION_POLLS_CLOSE,vicElectionFooterHTML,vicMemberAuthorisationHTML} from '../public/vic-election.js';
import * as electorates from '../public/electorates.js';

const vic={name:'Example Member',representation:[{jurisdiction:'vic',chamber:'vic_la',electorate:'Example District'}]};
const mlc={name:'Example Councillor',representation:[{jurisdiction:'vic',chamber:'vic_lc',electorate:'Example Region'}]};
const federal={name:'Example Senator',representation:[{jurisdiction:'federal',chamber:'senate',electorate:'Victoria'}]};
const CLOSE=Date.parse(VIC_ELECTION_POLLS_CLOSE);

test('the polls close at 6 pm on Saturday 28 November 2026 in Melbourne',()=>{
  assert.equal(new Date(CLOSE).toISOString(),'2026-11-28T07:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Melbourne',weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'numeric',minute:'2-digit',hour12:false}).format(new Date(CLOSE)),'Saturday 28 November 2026 at 18:00');
});

test('a Victorian member page carries the seat pages’ block up to the close of polls, and not after',()=>{
  const block=vicElectionFooterHTML();
  assert.ok(block.includes(`<p class="authorisation-line">${VIC_ELECTION_AUTHORISATION_LINE}</p>`));
  for(const now of [new Date('2026-11-16T10:00:00+11:00'),new Date('2026-11-28T17:59:59+11:00'),new Date(CLOSE-1)])
    for(const person of [vic,mlc]) assert.equal(vicMemberAuthorisationHTML(person,now),block,now.toISOString());
  for(const now of [new Date(CLOSE),new Date('2026-11-28T18:00:01+11:00'),new Date('2026-11-29T00:00:00+11:00'),new Date('2027-03-01T00:00:00+11:00')])
    for(const person of [vic,mlc]) assert.equal(vicMemberAuthorisationHTML(person,now),'',now.toISOString());
});

test('only Victorian members carry it',()=>{
  const now=new Date('2026-11-16T10:00:00+11:00');
  for(const person of [federal,{name:'No seat'},{name:'Empty',representation:[]},null,undefined]) assert.equal(vicMemberAuthorisationHTML(person,now),'');
  assert.equal(vicMemberAuthorisationHTML({representation:[...federal.representation,...vic.representation]},now),vicElectionFooterHTML());
});

test('the server prerender and the client page both draw it through the one dated helper',async()=>{
  const worker=await readFile(new URL('../src/index.ts',import.meta.url),'utf8');
  assert.equal(worker.match(/vicMemberAuthorisationHTML\(p\)/g)?.length,3,'the profile prerender (wrapped) and the roster-only prerender');
  // The client reaches the helper through the electorate module it already loads on a person page.
  for(const now of [new Date(CLOSE-1),new Date(CLOSE)]) assert.equal(electorates.vicMemberAuthorisationHTML(vic,now),vicMemberAuthorisationHTML(vic,now));
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const source=app.match(/async function renderPersonVicAuthorisation\(roster, sections\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);assert.match(app,/renderPersonVicAuthorisation\(roster, sections\);/);
  const draw=async(roster,now,{stale=false}={})=>{
    const doc=new JSDOM('<div id="main"><div id="sections"></div></div>').window.document,sections=doc.getElementById('sections');
    if(stale) sections.insertAdjacentHTML('afterend',vicElectionFooterHTML());
    const run=new Function('loadElectorateModule','currentSubjectKey',source+';return renderPersonVicAuthorisation;')(
      async()=>({vicMemberAuthorisationHTML:person=>vicMemberAuthorisationHTML(person,now)}),'k');
    await run(roster,sections);
    return doc.getElementById('main');
  };
  const before=await draw(vic,new Date(CLOSE-1));
  assert.equal(before.querySelectorAll('.authorisation').length,1);
  assert.equal(before.lastElementChild.querySelector('.authorisation-line').textContent,VIC_ELECTION_AUTHORISATION_LINE);
  assert.equal((await draw(vic,new Date(CLOSE-1),{stale:true})).querySelectorAll('.authorisation').length,1,'drawn once');
  assert.equal((await draw(vic,new Date(CLOSE))).querySelectorAll('.authorisation').length,0);
  assert.equal((await draw(vic,new Date(CLOSE),{stale:true})).querySelectorAll('.authorisation').length,0,'a block drawn before the close is removed');
  assert.equal((await draw(federal,new Date(CLOSE-1))).querySelectorAll('.authorisation').length,0);
});
