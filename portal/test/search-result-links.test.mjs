import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function searchResultHref'),app.indexOf('function bibtexFor'))+app.slice(app.indexOf('function csvCell'),app.indexOf('/**\n * A small format menu'));
const downloads=[],outcomes=[];
const context={siteUrl:p=>'https://opax.com.au'+p,safeUrl:u=>typeof u==='string'&&/^https?:\/\//.test(u)?u:null,corpusVersion:()=> 'test',
 download:(name,mime,text)=>downloads.push({name,mime,text}),trackOutcome:(name,props)=>outcomes.push({name,props}),
 bibtexFor:r=>`@misc{${r.slug}}`,risFor:r=>`TY  - GEN\nID  - ${r.slug}\nER  -`};
runInNewContext(source,context);
test('the export menu writes one file per chosen format and ignores anything else',()=>{
 const rows=[{slug:'speech-1',kind:'speech',title:'A speech',href:'/doc/speech-1'}];
 context.exportSources('csv',rows,['# question: test'],'opax-ask-sources');
 context.exportSources('bibtex',rows,[],'opax-ask-sources');
 context.exportSources('ris',rows,[],'opax-search');
 context.exportSources('pdf',rows,[],'opax-search');
 context.exportSources('csv',[],[],'opax-search');
 assert.deepEqual(downloads.map(d=>d.name),['opax-ask-sources.csv','opax-ask-sources.bib','opax-search.ris']);
 assert.match(downloads[0].text,/^# question: test/m);assert.match(downloads[1].text,/@misc\{speech-1\}/);assert.match(downloads[2].text,/ID {2}- speech-1/);
 assert.deepEqual(outcomes.map(o=>o.props.format),['csv','bibtex','ris']);
});
test('financial result links stay on the current site while exports use canonical URLs',()=>{
 const row={href:'/subject/supplier/s-123?contract=CN42',kind:'contract',slug:'catalog-42',title:'Contract award'};
 assert.equal(context.searchResultHref(row),row.href);
 assert.equal(context.searchResultUrl(row),'https://opax.com.au'+row.href);
 const csv=context.sourcesCSV([row],[]);assert.match(csv,/https:\/\/opax.com.au\/subject\/supplier\/s-123\?contract=CN42/);assert.doesNotMatch(csv,/\/doc\/catalog/);
});
test('official external links retain their origin and unsafe links are rejected',()=>{
 assert.equal(context.searchResultHref({href:'https://foreigninfluence.ag.gov.au/Profile/42'}),'https://foreigninfluence.ag.gov.au/Profile/42');
 assert.equal(context.searchResultHref({href:'javascript:alert(1)',slug:'speech-42'}),'/doc/speech-42');
 assert.equal(context.searchResultHref({href:'//evil.example',slug:'speech-42'}),'/doc/speech-42');
});
test('financial exports escape source text and spreadsheet formulas',()=>{
 const csv=context.sourcesCSV([{slug:'catalog-1',href:'/money',kind:'receipt',title:'=HYPERLINK("bad")',snippet:'one,two\nthree'}],[]);
 assert.match(csv,/'=HYPERLINK/);assert.match(csv,/"one,two\nthree"/);
});
