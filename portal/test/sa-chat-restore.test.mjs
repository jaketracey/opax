import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import {saDisplayPayload} from '../public/sa-hansard.js';

const source = ts.createSourceFile('app.js',readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const fn = name => source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name).getText(source);
const quotation = Array.from({length:240},(_,i)=>`word${i}`).join(' ');
const turn = {role:'answer',text:`“${quotation}”`,sources:[{kind:'speech',state:'sa',source:'sa_hansard',resource:'fixture-sa',snippet:quotation,url:'https://hansard.parliament.sa.gov.au/fixture'}]};
const words = text => String(text).trim().split(/\s+/).filter(Boolean).length;

function fixture(t,surface='docked') {
  const dom = new JSDOM(`<html data-chat="${surface}" data-panel="${surface==='page'?'chat':'ask'}"><body>
    <section id="panel-chat"><div id="chat-thread"></div><input id="chat-input"><button id="chat-new"></button><button id="dock-new"></button></section>
    <button id="chat-launcher"></button></body></html>`,{url:'https://offline.invalid/ask',runScripts:'outside-only'});
  t.after(()=>dom.window.close());
  const w = dom.window;
  w.__policy = {saDisplayPayload};
  w.__saved = JSON.parse(JSON.stringify(turn));
  w.eval(`
    const $ = id=>document.getElementById(id);
    let routeRequest=1, chatRestoreRequest=0, chatThread=[], chatKind='all',chatSpeaker='',chatAskOnArrival=null;
    let saDisplayHelpers,saFullTextFlag='false',chatBusy=false,chatAbort=null,chatFollowAbort=null;
    let dockOpen=${surface==='docked'},voiceAssistant=null;
    const chatFollower={stop(){}};
    const chatIsPage=()=>document.documentElement.dataset.panel==='chat';
    const store={active:'saved',chats:[{id:'saved',kind:'all',thread:[{role:'user',text:'Fixture saved question'},__saved],updated:0}]};
    let reads=0;
    const activeChat=()=>{reads++;return store.chats.find(c=>c.id===store.active)};
    const chatStoreRead=()=>store,chatStoreWrite=()=>{},saveChatSession=()=>{};
    const chatTitleFor=()=> 'Fixture chat', isSavedChat=()=>true;
    const chatAccount=async()=>({}),chatSyncLater=()=>{};
    const api=async path=>path==='/api/community/chats'?{chats:[{id:'saved',updated_at:1}]}:{chat:{id:'saved',updated_at:1,data:{thread:[{role:'user',text:'Fixture remote question'},__saved]}}};
    const saDisplayReady=new Promise((resolve,reject)=>{
      window.__release=(flag='false')=>{saDisplayHelpers=__policy;saFullTextFlag=flag;resolve()};
      window.__fail=()=>reject(new Error('Fixture module unavailable'));
    });
    const syncAskChatViewport=()=>{},renderChatScope=()=>{},renderChatContext=()=>{},renderChatOpening=()=>{};
    const renderChatHistory=()=>{},requestChatFollowups=()=>{},scrollChatToEnd=()=>{};
    const sendChat=()=>{},requestAnimationFrame=()=>0,matchMedia=()=>({matches:false});
    const rendered=[];
    const chatAnswerEl=msg=>{rendered.push(msg);const node=document.createElement('blockquote');node.className='chat-turn-answer';node.textContent=msg.text;return node;};
    ${['trimUnanswered','loadChatSession','savedSpeaker','chatRestoreCurrent','chatPolicyReady','openSavedChat','chatSyncPull','startNewConversation','takeChatArrival','initChat','renderChatThread','closeDock'].map(fn).join('\n')}
    window.__start=()=>initChat(false);
    window.__open=id=>openSavedChat(id);
    window.__pull=()=>chatSyncPull();
    window.__close=()=>closeDock({restoreFocus:false});
    window.__new=()=>startNewConversation();
    window.__navigate=()=>{routeRequest++;document.documentElement.dataset.chat='';$('panel-chat').hidden=true;};
    window.__state=()=>({reads,rendered,thread:chatThread,active:store.active});
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

for(const leave of ['__close','__navigate']) test(`late policy completion after ${leave} does not restore or render an answer`,async t=>{
  const w=fixture(t),pending=w.__start();w[leave]();w.__release();await pending;
  assert.equal(w.__state().reads,0);assert.equal(w.__state().rendered.length,0);
  assert.equal(w.document.getElementById('panel-chat').hidden,true);
});

test('failed helper loading leaves a saved answer undisplayed',async t=>{
  const w=fixture(t),pending=w.__start();w.__fail();await pending;
  assert.equal(w.__state().reads,0);assert.equal(w.__state().rendered.length,0);
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
