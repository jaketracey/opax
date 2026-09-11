import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const chunk=source.slice(source.indexOf('function safeAnswerLink('),source.indexOf('function renderEvidenceAnswer('));
const node=tag=>({tag,children:[],appendChild(child){this.children.push(child)}});
const document={createElement:node,createTextNode:text=>({text})};
const {safeAnswerLink,appendInline}=runInNewContext(chunk+';({safeAnswerLink,appendInline})',{URL,document});

test('answer links allow Opax record paths, never foreign origins or executable schemes',()=>{
 for(const href of ['/graph/money.json','/money?industry=gambling']) assert.equal(safeAnswerLink(href),href);
 assert.equal(safeAnswerLink('https://opax.com.au/graph/money.json'),'/graph/money.json');
 assert.equal(safeAnswerLink('/money?party=party%3ALabor&focus=donor%3AMineralogy'),'/money?party=party%3ALabor&focus=donor%3AMineralogy');
 assert.equal(safeAnswerLink('/subject/person/David%20Pocock'),'/subject/person/David%20Pocock');
 for(const href of ['javascript:alert(1)','data:text/html,test','//evil.test','/\\evil.test','https://name:secret@opax.com.au/','https://example.test/\npath','https://www.aec.gov.au/','https://opax.com.au.evil.test/']) assert.equal(safeAnswerLink(href),null,href);
});
test('calculation links become anchors while model HTML and unsafe links stay text',()=>{
 const root=node('p');appendInline(root,'[Download the calculation data](/graph/money.json) <script>alert(1)</script> [bad](javascript:alert)');
 const anchors=root.children.filter(n=>n.tag==='a');assert.equal(anchors.length,1);assert.equal(anchors[0].href,'https://opax.com.au/graph/money.json');assert.equal(anchors[0].children[0].text,'Download the calculation data');
 assert.ok(root.children.some(n=>n.text?.includes('<script>')));assert.ok(root.children.some(n=>n.text?.includes('[bad]')));
 const code=node('p');appendInline(code,'`[Example](/money)`');assert.equal(code.children[0].tag,'code');assert.equal(code.children[0].textContent,'[Example](/money)');
});
