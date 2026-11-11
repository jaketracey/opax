import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {renderMoneyAnswer} from '../src/seo-content.ts';

// sharedMoneyAnswer and its memo, cut from src/index.ts by TypeScript's parser.
const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
const parsed=ts.createSourceFile('index.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const names=new Set(['moneyAnswerMemo','sharedMoneyAnswer']);
const statements=parsed.statements.filter(node=>ts.isFunctionDeclaration(node)?names.has(node.name?.text):ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>names.has(d.name.getText(parsed))));
const code=ts.transpileModule(statements.map(node=>node.getText(parsed)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const published=path=>JSON.parse(readFileSync(new URL('../public'+path,import.meta.url),'utf8'));

test('the money summary renders once per title per isolate, matches a fresh render, and retries after a failure',async()=>{
 const shared=runInNewContext(code+';sharedMoneyAnswer',{Map,renderMoneyAnswer});
 const reads=[];let fail=true;
 const read=async path=>{reads.push(path);if(fail&&path==='/suppliers.json'){fail=false;throw Error('unavailable')}return published(path)};
 await assert.rejects(shared('Public money',read));
 const first=await shared('Public money',read), count=reads.length;
 assert.equal((await shared('Public money',read)).html,first.html);
 assert.equal(reads.length,count,'the second render reads nothing');
 assert.equal(first.html,(await renderMoneyAnswer('Public money',async path=>published(path))).html);
 const map=await shared('Money map',read);
 assert.match(map.html,/<h1>Money map<\/h1>/);assert.ok(reads.length>count);
});
