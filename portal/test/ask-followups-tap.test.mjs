// One tap on a follow-up under an /ask answer asks it (14 Oct report: the
// first tap opened the conversation without asking; a second tap asked).
// route() is async, so a question sent straight after goRoute("/chat") landed
// in the thread before initChat seeded it with the Ask answer, and the seed
// replaced it. The question now waits for initChat, which asks it once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import ts from 'typescript';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('app.js', app, ts.ScriptTarget.Latest, true);
const fn = (name) => parsed.statements.find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name).getText(parsed);

function page() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <section id="ask-followups" hidden></section>
    <input id="chat-input">
    </body></html>`, { url: 'https://opax.com.au/ask?q=x', runScripts: 'outside-only' });
  const { window } = dom;
  window.eval(`
    const $ = (id) => document.getElementById(id);
    const store = { chats: [], active: null };
    let chatThread = [], chatKind = 'all', chatSpeaker = '', chatAskOnArrival = null;
    const sent = [];
    const routes = [];
    window.__sent = sent; window.__routes = routes; window.__thread = () => chatThread;
    const trackOutcome = () => {};
    const loadChatSession = () => {};
    const chatStoreRead = () => store;
    const chatStoreWrite = () => {};
    const saveChatSession = () => {};
    const savedSpeaker = () => '';
    const renderChatThread = () => {};
    const renderChatHistory = () => {};
    const requestChatFollowups = () => {};
    const chatSyncPull = () => {};
    const scrollChatToEnd = () => {};
    window.requestAnimationFrame = () => 0;
    // What sendChat does first: the question joins the thread being shown.
    function sendChat(question, carry) {
      sent.push({ question, carry, before: chatThread.map((m) => m.text) });
      chatThread.push({ role: 'user', text: question });
    }
    // route() awaits its prerequisites before the chat view runs initChat;
    // the stub waits a task, so nothing sent in the tap's own turn survives.
    function goRoute(target) {
      routes.push(target);
      setTimeout(() => initChat(false), 0);
    }
    ${fn('openConversationFrom')}
    ${fn('takeChatArrival')}
    ${fn('askFollowupHandler')}
    ${fn('initChat')}
    ${fn('renderFollowups')}
    window.__render = (questions, ask) => renderFollowups(questions, $('ask-followups'), askFollowupHandler(ask));
  `);
  return window;
}
const plain = (v) => JSON.parse(JSON.stringify(v)); // arrays from the page's realm
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));
const ask = { question: 'What did the committee find?', answer: 'It found three things.', sources: [] };

test('one tap on a follow-up under the answer asks it once, after the answer seeds the thread', async () => {
  const window = page();
  window.__render([{ question: 'Who chaired it?', evidence: 'The chair was named.' }, { question: 'When did it report?' }], ask);
  const buttons = [...window.document.querySelectorAll('#ask-followups button.chat-next-btn')];
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].type, 'button', 'a real button: Enter and Space activate it');
  assert.match(buttons[0].textContent, /Who chaired it\?/);
  buttons[0].click();
  assert.deepEqual(plain(window.__sent), [], 'not sent before the conversation is drawn');
  await settle();
  assert.deepEqual(plain(window.__routes), ['/chat']);
  assert.equal(window.__sent.length, 1, 'asked once');
  assert.equal(window.__sent[0].question, 'Who chaired it?');
  assert.equal(window.__sent[0].carry.evidence, 'The chair was named.', 'the chip keeps its evidence');
  assert.deepEqual(plain(window.__sent[0].before), [ask.question, ask.answer], 'asked into the seeded thread');
  assert.deepEqual(plain(window.__thread().map((m) => m.text)), [ask.question, ask.answer, 'Who chaired it?']);
});

test('two quick taps before the conversation opens still ask once', async () => {
  const window = page();
  window.__render([{ question: 'Who chaired it?' }, { question: 'When did it report?' }], ask);
  const [first, second] = window.document.querySelectorAll('#ask-followups button');
  first.click();
  second.click();
  await settle();
  // Each tap routes; the router drops all but the latest. Here both run, and
  // the arrival is taken by the first initChat only.
  assert.equal(window.__sent.length, 1);
  assert.equal(window.__sent[0].question, 'When did it report?', 'the last choice wins');
});

test('the follow-up card style is not scoped to the conversation view alone', () => {
  assert.match(css, /:is\(#panel-ask, #panel-chat\) \.chat-next-btn \{[^}]*border:[^}]*color: var\(--bronze-ink\)/);
  const outsideHoverQueries = css.replace(/@media \(hover: hover\) \{[\s\S]*?\n\}/g, '');
  assert.doesNotMatch(outsideHoverQueries, /\.chat-next-btn:hover/, 'hover styles only where hover exists');
});
