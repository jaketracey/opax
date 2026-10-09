import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as markdown from '../public/division-markdown.js';
import {renderBillAnswer, renderDivisionAnswer, renderPersonAnswer} from '../src/seo-content.ts';
const {renderDivisionMarkdown:render, divisionPlain, billNoteRepair}=markdown;
const read = name => JSON.parse(readFileSync(new URL(`../public/${name}`,import.meta.url),'utf8'));
const bill = read('bills/au-federal-s1488.json');
const division = bill.divisions.find(d=>d.key==='federal-senate-10178');

test('paragraphs and explicit line breaks survive text repairs',()=>{
 assert.equal(render('First\nline\n\nSecond'),'<p>First<br>line</p><p>Second</p>');
 assert.equal(billNoteRepair('"the guillotine"(Read more here. )\n\nNext'), '"the guillotine" (Read more here.)\n\nNext');
 assert.equal(render('[Policy](/policies/21)'),'<p><a href="https://theyvoteforyou.org.au/policies/21" rel="noopener" target="_blank">Policy&nbsp;↗︎</a></p>');
});
test('all supported headings use small bold blocks, never h1 or h2',()=>{
 const html=render('# One\n## Two\n### Three');
 assert.equal((html.match(/class="division-markdown-heading"/g)||[]).length,3);
 assert.match(html,/<strong>Three<\/strong>/);assert.doesNotMatch(html,/<h[12]/);
});
test('quotes, blank quoted paragraphs and emphasis render as blocks',()=>{
 assert.equal(render('> **Bold**\n>\n> *Italic*'),'<blockquote><p><strong>Bold</strong></p><p><em>Italic</em></p></blockquote>');
 assert.equal(render('A > B'),'<p>A &gt; B</p>');
 assert.equal(render('> *(1) Quoted item*'),'<blockquote><p><em>(1) Quoted item</em></p></blockquote>');
});
test('unordered and numbered lists preserve numbering and continuation',()=>{
 assert.equal(render('- One\n* Two\n\n3. Three\n   continued\n4. Four'),'<ul><li>One</li><li>Two</li></ul><ol start="3"><li>Three<br> continued</li><li>Four</li></ol>');
});
test('links keep source treatment and emphasis; HTML is escaped',()=>{
 const html=render('**Bold** and *italic*: [**source**](https://example.test/a?x=1&y=2)\n<script>alert("x")</script>');
 assert.match(html,/<strong>Bold<\/strong> and <em>italic<\/em>/);
 assert.match(html,/<a href="https:\/\/example.test\/a\?x=1&amp;y=2" rel="noopener" target="_blank"><strong>source<\/strong>&nbsp;↗︎<\/a>/);
 assert.match(html,/&lt;script&gt;alert \(&quot;x&quot;\)&lt;\/script&gt;/);assert.doesNotMatch(html,/<script/);
 assert.match(render('[Act](https://example.test/Act_(1995))'),/href="https:\/\/example.test\/Act_\(1995\)"/);
});
test('javascript, data, ftp and protocol-relative links are refused',()=>{
 for(const href of ['javascript:alert(1)','data:text/html,evil','//evil.test','ftp://evil.test'])assert.doesNotMatch(render(`[label](${href})`),/<a\b/);
 assert.doesNotMatch(render('["><img src=x onerror=alert(1)>](https://example.test/)'),/<img\b|onerror="/);
});
test('flattened TVFY fixture preserves words, first sentence and source links',()=>{
 const html=render(division.question);
 assert.match(html,/<strong>What is the bill&#39;s main idea\?<\/strong>/);
 assert.match(html,/<blockquote><p><em>Amends the Criminal Code Act 1995/);assert.doesNotMatch(html,/###|&gt; /);
 assert.ok(html.startsWith('<p>The majority voted against a <a'));
 const visible=html.replace(/&nbsp;↗︎/g,'').replace(/<\/?(?:p|blockquote)[^>]*>/g,' ').replace(/<[^>]+>/g,'').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
 assert.equal(visible,divisionPlain(division.question));
});
test('SPA shares the SSR renderer and retains title/stage stripping and sentence splitting',()=>{
 const src=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 const funcs=['billNoteRepair','billNoteHTML','billStripTitle','billStripStage','billQuestionParts'].map(name=>src.slice(src.indexOf(`function ${name}(`)).split('\n}\n')[0]+'\n}').join('\n');
 const c={divisionMarkdown:markdown,BILL_DESCRIPTION:/^(this (is|division|motion|amendment)\b|the (majority|motion) )/i,BILL_PLACEHOLDER:/^(long debate text truncated|text truncated|no text recorded)\.?$/i,billFlat:divisionPlain};
 runInNewContext(funcs,c);
 assert.equal(c.billNoteHTML(division.question),render(division.question));
 assert.equal(c.billQuestionParts(division,bill).note,division.question);
 const fake={question:'Example Bill - Second reading - A sufficiently long first sentence about the motion.\n\n### Background\n> More **detail** about the record and what it means for this bill and its readers.',stage:'Second reading'};
 const parts=c.billQuestionParts(fake,{title:'Example Bill'});
 assert.equal(parts.head,'A sufficiently long first sentence about the motion.');assert.match(c.billNoteHTML(parts.note),/<blockquote>/);
});
test('bill and nightly-exported division SSR contain formatted fixture without raw Markdown',()=>{
 for(const html of [renderBillAnswer(bill,[],new Map()).html,renderDivisionAnswer(read('divisions/division-federal-senate-10178.json'),[],new Map()).html]){
  assert.doesNotMatch(html,/###|&gt; /);assert.match(html,/<blockquote>/);
  assert.match(html,/<strong>What is the bill&#39;s main idea\?<\/strong>/);
  assert.match(html,/The majority voted against/);assert.equal((html.match(/<h1\b/g)||[]).length,1);
 }
});
test('MP vote questions use the same renderer when supplied',async()=>{
 const data={'1':{name:'Example Member',jurisdiction:'federal',for:[{name:'Example Bill',date:'2026-04-01',question:division.question}],against:[]}};
 const read=async path=>{if(path==='/votes.json')return data;throw Error('No fixture');};
 const html=(await renderPersonAnswer({pid:'1',name:'Example Member',states:[],chambers:['senate']},read,new Map())).html;
 assert.match(html,/<blockquote>/);assert.doesNotMatch(html,/###|&gt; /);
});
