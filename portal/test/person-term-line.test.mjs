// The client person header says what the server's head says of a member of an expired Victorian house:
// "Member for X until the Assembly expired on 3 November", not the bare seat name.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {personTermLineHTML} from '../public/electorates.js';
import {vicTermEnd} from '../public/vic-term.js';
import {personHeadPrerender} from '../src/seo-content.ts';
import {vicEndedSeat} from '../src/vic-term-role.ts';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const manifest=await json('../public/electorates/manifest.json');
const rows=(await json('../public'+manifest.index_url)).electorates;
const roster=(await json('../public/parliamentarians.json')).people;
const text=html=>new JSDOM(`<p>${html}</p>`).window.document.body.textContent;

test('every member a seat row names gets the server’s line in the client header, with the seat linked',()=>{
  const members=roster.filter(p=>vicTermEnd(p,rows)?.row);
  assert.ok(members.length>=120);
  for(const p of members) {
    const row=vicTermEnd(p,rows).row,line=personTermLineHTML(p,rows);
    assert.equal(text(line),`Member for ${row.name}${row.chamber==='vic_lc'?' Region':''} until the ${row.chamber==='vic_lc'?'Council':'Assembly'} expired on 3 November`,p.name);
    assert.ok(line.includes(`<a href="${row.url}">`),p.name);
    const server=new JSDOM(personHeadPrerender('<section id="prerender" class="wrap"><h1>Person</h1></section>',p,{ended:vicEndedSeat(p,rows)})).window.document.body.textContent;
    assert.ok(server.includes(text(line)),p.name);
  }
});

test('nobody else gets it: former members, surname prints, other parliaments, and after the new roster loads',()=>{
  for(const name of ['Sam Groth','Tim Read','Connolly','Richardson']) assert.equal(personTermLineHTML(roster.find(p=>p.name===name),rows),'',name);
  for(const p of roster.filter(p=>!p.representation?.some(r=>r.jurisdiction==='vic'))) assert.equal(personTermLineHTML(p,rows),'',p.name);
  const seated=rows.map(e=>'dissolved_for' in e?{...e,dissolved_for:null}:e);
  for(const p of roster) assert.equal(personTermLineHTML(p,seated),'',p.name);
  assert.equal(personTermLineHTML(null,rows),'');assert.equal(personTermLineHTML(roster[0],[]),'');
});

test('the person page uses the line where there is one',async()=>{
  const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(app,/const termLine = roster && electorateReference \? electorateReference\.module\.personTermLineHTML\?\.\(roster, electorateReference\.data\.electorates\) \|\| "" : "";/);
  assert.match(app,/termLine \? `<span>\$\{termLine\}<\/span>` : electorateLinks \?/);
});
