import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start = source.indexOf('function renderRecordRetry(');
const code = source.slice(start,source.indexOf('function renderFollowups(',start));
test('the quiet neutral action retries the original factual record scope, without changing the five chips', () => {
  const row = {children:Array.from({length:5},(_,i)=>({label:`Comparison ${i+1}`})),appendChild(child){this.children.push(child);}};
  const container = {querySelector(selector){assert.equal(selector,'.chat-next-btns');return row;}};
  const document = {createElement(tag){assert.equal(tag,'button');return {addEventListener(event,listener){assert.equal(event,'click');this.click=listener;}};}};
  const render = runInNewContext(code+';renderRecordRetry',{document});
  const request = {question:'Is this MP good on housing?',speaker:'Example MP',kind:'speech',party:'Example party',chamber:'house',state:'federal',topic:'housing',from:'2020',to:'2025',context:[{author:'user',text:'What did Example MP propose about housing?'}],prior_resources:['a'.repeat(32)]};
  const original = structuredClone(request);
  let retried;
  render(container,{label:'Ask for the record instead'},request,value=>{retried=JSON.parse(JSON.stringify(value));});
  assert.equal(row.children.length,6);
  const button=row.children[5];
  assert.equal(button.type,'button'); assert.equal(button.className,'ask-record-retry');
  assert.equal(button.textContent,'Ask for the record instead');
  request.speaker='Another MP'; request.from='2010'; request.context[0].text='Another topic.';
  button.click();
  assert.deepEqual(retried,{...original,record_only:true});
});

test('the neutral retry is wired to both first answers and saved follow-up answers', () => {
  assert.match(source,/renderRecordRetry\(\$\("ask-followups"\), data\.record_retry, askInput, input => runAsk\(input\.question, input\)\)/);
  assert.match(source,/renderRecordRetry\(next, recordRetry, recordRequest, input => sendChat\(input\.question, \{ recordRequest: input \}\)\)/);
  assert.match(source,/record_request: seed\.record_request/);
  assert.match(source,/const chatInput = carry\?\.recordRequest \|\|/);
});
