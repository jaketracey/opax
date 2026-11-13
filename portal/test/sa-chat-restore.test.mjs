import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import {saDisplayPayload} from '../public/sa-hansard.js';
import {chatContext} from '../public/chat-context.js';

const source = ts.createSourceFile('app.js',readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const fn = name => source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(source);
// Keep the production lazy loader and its policy response handling in the fixture.
const policyReady = source.statements.find(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(d=>d.name.getText(source)==='saDisplayReady')).getText(source);
const fixtureImports = code => code.replace(/import\(/g,'fixtureImport(');
const quotation = Array.from({length:240},(_,i)=>`word${i}`).join(' ');
const turn = {role:'answer',text:`“${quotation}”`,sources:[{kind:'speech',state:'sa',source:'sa_hansard',resource:'fixture-sa',snippet:quotation,url:'https://hansard.parliament.sa.gov.au/fixture'}]};
const words = text => String(text).trim().split(/\s+/).filter(Boolean).length;

function fixture(t,surface='docked') {
  const dom = new JSDOM(`<html data-chat="${surface}" data-panel="${surface==='page'?'chat':'ask'}"><body>
    <section id="panel-chat"><div id="chat-thread"></div><input id="chat-input"><button id="chat-new"></button><button id="dock-new"></button><button id="chat-send"></button><p id="chat-status"></p></section>
    <button id="chat-launcher"></button></body></html>`,{url:'https://offline.invalid/ask',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w = dom.window;
  w.__policy = {saDisplayPayload};
  w.__context = {chatContext};
  w.__saved = JSON.parse(JSON.stringify(turn));
  w.Element.prototype.scrollIntoView = ()=>{};
  w.eval(`
    const $ = id=>document.getElementById(id);
    let routeRequest=1, chatRestoreRequest=0, chatThread=[], chatKind='all',chatSpeaker='',chatAskOnArrival=null;
    let saDisplayHelpers,saFullTextFlag='false',chatBusy=false,chatAbort=null,chatFollowAbort=null,chatTimer=0;
    let dockOpen=${surface==='docked'},voiceAssistant=null;
    const chatFollower={stop(){},start(){},nudge(){},moved(){return false}};
    const chatIsPage=()=>document.documentElement.dataset.panel==='chat';
    const store={active:'saved',chats:[{id:'saved',kind:'all',thread:[{role:'user',text:'Fixture saved question'},__saved],updated:0}]};
    let reads=0;
    const activeChat=()=>{reads++;return store.chats.find(c=>c.id===store.active)};
    const chatStoreRead=()=>store,chatStoreWrite=()=>{},saveChatSession=()=>{};
    const chatTitleFor=()=> 'Fixture chat', isSavedChat=()=>true;
    const chatAccount=async()=>({}),chatSyncLater=()=>{};
    const api=async path=>path==='/api/community/chats'?{chats:[{id:'saved',updated_at:1}]}:{chat:{id:'saved',updated_at:1,data:{thread:[{role:'user',text:'Fixture remote question'},__saved]}}};
    let resolveModule,resolvePolicy;
    const helperModule=new Promise((resolve,reject)=>{
      resolveModule=resolve;
      window.__fail=()=>reject(new Error('Fixture module unavailable'));
    });
    const displayPolicy=new Promise(resolve=>{resolvePolicy=resolve});
    window.__release=(flag='false')=>{resolveModule(__policy);resolvePolicy(flag)};
    window.__lateFullText=()=>resolvePolicy('true');
    const fetch=()=>displayPolicy.then(flag=>({json:async()=>({SA_HANSARD_FULL_TEXT:flag})}));
    const fixtureImport=path=>path.startsWith('/sa-hansard.js')?helperModule
      :path.startsWith('/chat-context.js')?Promise.resolve(__context)
      :Promise.reject(new Error('Fixture optional animation unavailable'));
    ${fn('lazyReady')}
    ${fixtureImports(policyReady)}
    const syncAskChatViewport=()=>{},renderChatScope=()=>{},renderChatContext=()=>{},renderChatOpening=()=>{};
    const renderChatHistory=()=>{},requestChatFollowups=()=>{},scrollChatToEnd=()=>{};
    const requestAnimationFrame=()=>0,matchMedia=()=>({matches:false});
    let sent=0;
    const askRecord=async(_body,_signal,on)=>{
      sent++;
      if(window.__stream){
        on.delta(__saved.text);
        await new Promise(resolve=>setTimeout(resolve,0));
        window.__provisional=[...document.querySelectorAll('.answer')].map(el=>el.textContent);
      }
      return {answer:__saved.text,sources:__saved.sources};
    };
    const renderAnswer=(el,text)=>{el.textContent=text};
    const researchOf=()=>undefined,setStatus=(el,message)=>{el.textContent=message};
    const rendered=[];
    const chatAnswerEl=msg=>{rendered.push(msg);const node=document.createElement('blockquote');node.className='chat-turn-answer';node.textContent=msg.text;return node;};
    ${fixtureImports(['trimUnanswered','loadChatSession','savedSpeaker','chatRestoreCurrent','cappedChatPayload','chatPolicyReady','openSavedChat','chatSyncPull','startNewConversation','takeChatArrival','initChat','renderChatThread','closeDock','streamSafeText','streamRenderer','sendChat'].map(fn).join('\n'))}
    window.__start=()=>initChat(false);
    window.__open=id=>openSavedChat(id);
    window.__pull=()=>chatSyncPull();
    window.__close=()=>closeDock({restoreFocus:false});
    window.__new=()=>startNewConversation();
    window.__send=()=>sendChat('Fixture new question');
    window.__cap=value=>cappedChatPayload(value);
    window.__navigate=()=>{routeRequest++;document.documentElement.dataset.chat='';$('panel-chat').hidden=true;};
    window.__state=()=>({reads,rendered,thread:chatThread,active:store.active,sent,busy:chatBusy,fullText:saFullTextFlag});
    window.__add=id=>store.chats.push({id,kind:'all',thread:[{role:'user',text:id},__saved]});
  `);
  return w;
}

for(const surface of ['docked','page']) test(`${surface} saved restore awaits policy and caps the same 240-word quotation`,async t=>{
  const w=fixture(t,surface),pending=w.__start();
  assert.equal(w.__state().reads,0,'saved turns are not restored before policy readiness');
  assert.equal(w.document.querySelectorAll('blockquote').length,0,'no unrestricted answer reaches the DOM');
  w.__release();await pending;
  assert.equal(words(w.document.querySelector('blockquote').textContent),120);
  assert.equal(words(w.__state().thread[1].sources[0].snippet),120);
});

test('the exact full-text policy still permits a saved complete answer',async t=>{
  const w=fixture(t),pending=w.__start();w.__release('true');await pending;
  assert.equal(words(w.document.querySelector('blockquote').textContent),240);
});

for(const leave of ['__close','__navigate']) for(const completion of ['__release','__fail']) test(`late policy ${completion} after ${leave} does not restore or render an answer`,async t=>{
  const w=fixture(t),pending=w.__start();w[leave]();w[completion]();await pending;
  assert.equal(w.__state().reads,0);assert.equal(w.__state().rendered.length,0);
  assert.equal(w.document.getElementById('panel-chat').hidden,true);
});

for(const surface of ['docked','page']) test(`${surface} failed helper loading restores a capped answer and ignores late full-text permission`,async t=>{
  const w=fixture(t,surface),pending=w.__start();w.__fail();await pending;
  assert.equal(words(w.document.querySelector('blockquote')?.textContent || ''),120);
  assert.equal(words(w.__state().thread[1].sources[0].snippet),120);
  w.__lateFullText();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.__state().fullText,'false');
  await w.__open('saved');
  assert.equal(words(w.document.querySelector('blockquote').textContent),120,'a retained import rejection still permits subsequent restores');
});

for(const surface of ['docked','page']) for(const stream of [false,true]) test(`${surface} sending a ${stream?'streaming':'whole'} answer after helper import failure completes with a capped answer`,async t=>{
  const w=fixture(t,surface);w.__stream=stream;
  const pending=w.__send();
  assert.equal(w.__state().sent,0,'sending waits for the policy decision');
  w.__fail();await pending;
  assert.equal(w.__state().sent,1,'the mocked answer request still runs');
  assert.equal(w.document.querySelector('.chat-error'),null);
  assert.equal(words(w.document.querySelector('blockquote')?.textContent || ''),120);
  assert.equal(words(w.__state().thread.at(-1).sources[0].snippet),120);
  for(const text of w.__provisional || [])assert.ok(words(text)<=120,'provisional stream text must never exceed the fallback cap');
  assert.equal(w.__state().busy,false);
  await w.__send();
  assert.equal(w.__state().sent,2,'a rejected helper import does not block later sends');
  for(const answer of w.document.querySelectorAll('blockquote'))assert.equal(words(answer.textContent),120);
});

test('a working full-text policy helper preserves progressive streaming',async t=>{
  const w=fixture(t);w.__stream=true;
  const pending=w.__send();w.__release('true');await pending;
  assert.equal(w.document.querySelector('.chat-error'),null);
  assert.equal(words(w.__provisional[0]),240,'the fixture observes provisional paints before the complete answer');
  assert.equal(words(w.document.querySelector('blockquote').textContent),240);
});

test('helper failure overrides full-text permission received before the import fails',async t=>{
  const w=fixture(t),pending=w.__start();
  w.__lateFullText();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.__state().fullText,'true');
  assert.equal(w.__state().rendered.length,0);
  w.__fail();await pending;
  assert.equal(w.__state().fullText,'false');
  assert.equal(words(w.document.querySelector('blockquote').textContent),120);
});

test('the conservative fallback bounds parallel source passages and quote arrays without mutating saved data',t=>{
  const w=fixture(t),input={answer:turn.text,citations:{'fixture-sa/t/body':[[0,9999]]},sources:[{
    ...turn.sources[0],text:quotation,passage:quotation,quotes:[quotation,quotation],evidence:[quotation,quotation],
    full_text_available:true,answerRanges:[[0,9999]],answer_ranges:[[0,9999]],
  }],evidence_excerpts:[{resource:'fixture-sa',text:quotation}]};
  const before=JSON.stringify(input),safe=w.__cap(input),source=safe.sources[0];
  assert.equal(JSON.stringify(input),before);
  assert.equal(words(safe.answer),120);
  for(const field of ['text','snippet','passage'])assert.equal(words(source[field]),120);
  for(const field of ['quotes','evidence'])assert.equal(words(source[field].join(' ')),120);
  assert.equal(source.text,source.snippet);
  assert.equal(source.url,input.sources[0].url);
  assert.equal(source.full_text_available,false);
  assert.equal(source.answerRanges.length,0);
  assert.equal(source.answer_ranges.length,0);
  assert.equal(Object.keys(safe.citations).length,0);
  assert.equal(words(safe.evidence_excerpts[0].text),120);
  assert.equal(w.__cap({answer:'A short answer.'}).answer,'A short answer.');
});

test('saved-history selection waits for policy and only the latest selection renders',async t=>{
  const w=fixture(t);w.__add('latest');
  const old=w.__open('saved'),latest=w.__open('latest');
  assert.equal(w.__state().rendered.length,0);w.__release();await Promise.all([old,latest]);
  assert.equal(w.__state().active,'latest');assert.equal(w.__state().rendered.length,1);
  assert.equal(words(w.document.querySelector('blockquote').textContent),120);
});

test('account-restored turns use the same policy gate before rendering',async t=>{
  const w=fixture(t),pending=w.__pull();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(w.__state().rendered.length,0);w.__release();await pending;
  assert.equal(words(w.document.querySelector('blockquote').textContent),120);
});

for(const leave of ['__close','__new']) test(`a late account restore respects ${leave} while policy is pending`,async t=>{
  const w=fixture(t),pending=w.__pull();await new Promise(resolve=>setTimeout(resolve,0));
  w[leave]();w.__release();await pending;
  assert.equal(w.__state().rendered.length,0);
  if(leave==='__new')assert.equal(w.__state().active,null);
});

test('a restored session seed is bounded before its answer is rendered',async t=>{
  const w=fixture(t);w.sessionStorage.setItem('opax-chat-seed',JSON.stringify({question:'Fixture seeded question',answer:turn.text,sources:turn.sources}));
  const pending=w.__start();assert.equal(w.document.querySelectorAll('blockquote').length,0);
  w.__release();await pending;assert.equal(words(w.document.querySelector('blockquote').textContent),120);
});
