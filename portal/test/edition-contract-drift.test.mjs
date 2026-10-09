import {personSlug,slugIndex} from '../src/person-slug.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {build} from 'esbuild';
import ts from 'typescript';

const source=name=>ts.createSourceFile(name,readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const collect=(root,predicate)=>{
  const nodes=[];const visit=node=>{if(predicate(node))nodes.push(node);ts.forEachChild(node,visit)};visit(root);return nodes;
};
const strings=array=>{
  assert.ok(ts.isArrayLiteralExpression(array));
  return array.elements.map(node=>{assert.ok(ts.isStringLiteral(node));return node.text});
};

test('frozen reader kinds, slide types and accepted links track the publisher contracts without invoking composition',async()=>{
  const publisher=source('daily-post.ts'),story=source('story.ts'),reader=source('app-edition.ts');
  const declaration=collect(publisher,n=>ts.isVariableDeclaration(n)&&n.name.getText(publisher)==='DAILY_POST_KINDS')[0];
  const kinds=strings(declaration.initializer.expression);
  const includes=field=>{
    const calls=collect(reader,n=>ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='includes'&&n.arguments[0]?.getText(reader)===field);
    assert.equal(calls.length,1);return strings(calls[0].expression.expression);
  };
  assert.deepEqual(includes('post.kind').sort(),[...kinds].sort(),'update the frozen kind validator when DAILY_POST_KINDS changes');
  const slide=story.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text==='StorySlide');assert.ok(slide);
  const types=collect(slide,n=>ts.isPropertySignature(n)&&n.name.getText(story)==='type').map(n=>{assert.ok(ts.isLiteralTypeNode(n.type)&&ts.isStringLiteral(n.type.literal));return n.type.literal.text});
  assert.deepEqual(includes('s.type').sort(),[...types].sort(),'update the frozen slide validator when StorySlide changes');

  // Extract the URL initializers actually used by each publisher, rather than
  // copying expected paths. Only the three pure URL helpers are evaluated in
  // a VM with no fetch, bindings, imports or publication/generation functions.
  const origin=collect(publisher,n=>ts.isVariableDeclaration(n)&&n.name.getText(publisher)==='ORIGIN')[0];assert.ok(ts.isStringLiteral(origin.initializer));
  const helpers=['recipientSegment','programUrl','largestUrl'].map(name=>{
    const fn=publisher.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn,name);return fn.getText(publisher).replace(/^export /,'');
  });
  const helperCode=ts.transpileModule(`const ORIGIN=${JSON.stringify(origin.initializer.text)};\n${helpers.join('\n')}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  const builders=new Map();
  for(const fn of publisher.statements.filter(ts.isFunctionDeclaration)){
    const declaredKinds=collect(fn,n=>ts.isPropertyAssignment(n)&&n.name.getText(publisher)==='kind'&&ts.isStringLiteral(n.initializer)).map(n=>n.initializer.text);
    if(!declaredKinds.length)continue;
    assert.equal(declaredKinds.length,1,'review new edition builders');
    const urls=collect(fn,n=>ts.isVariableDeclaration(n)&&n.name.getText(publisher)==='url');assert.equal(urls.length,1,fn.name.text);
    assert.equal(builders.has(declaredKinds[0]),false);builders.set(declaredKinds[0],urls[0].initializer.getText(publisher));
  }
  assert.deepEqual([...builders.keys()].sort(),[...kinds].sort(),'each published kind must have a reviewed link builder');
  const compiled=await build({entryPoints:[new URL('../src/app-edition.ts',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm'});
  const {appEdition}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  const fixtures={person:{name:'A Person / #'},bill:{key:'au-federal-r123'},grant:{recipientId:'ABN12345678901',id:'GA 123/#'},p:{key:'health / #'},month:'2026-09',slug:'climate / #'};
  for(const [kind,expression] of builders){
    const url=runInNewContext(helperCode+'\n'+expression,{...fixtures,roster:{people:[fixtures.person]},personSlug,slugIndex},{timeout:1000});assert.equal(typeof url,'string');
    for(const type of types){
      const basic=type=>({type,kicker:'Stored',title:'Stored title',alt:'Stored alternative'});
      const post={date:'2026-10-03',subject:kind+':fixture',kind,title:'Frozen title',text:'Frozen copy.',url,slides:[basic('cover'),basic(type),basic('source')]};
      const env={COMMUNITY_DB:{prepare(sql){assert.match(sql,/^SELECT /);return {bind(){return this},async first(){return {date:post.date,subject:post.subject,post_json:JSON.stringify(post),created_at:'2026-10-02T22:00:00Z'}}}}}};
      const response=await appEdition(new Request('https://opax.test/api/app/v1/edition/latest'),env,Date.UTC(2026,9,2,22));
      assert.equal(response.status,200,`${kind}/${type}: publisher URL ${url} must pass the frozen reader`);assert.deepEqual((await response.json()).edition,post);
    }
  }
});
